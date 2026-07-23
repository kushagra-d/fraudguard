require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Queue } = require('bullmq');

const pool = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');
const { requireApiKey } = require('./middleware/apiKey');
const { logAudit } = require('./audit');

const app = express();
app.use(cors());
app.use(express.json());

const connection = { host: '127.0.0.1', port: 6379 };
const transactionQueue = new Queue('transaction-scoring', { connection });

const VALID_TYPES = ['CASH_IN', 'CASH_OUT', 'DEBIT', 'PAYMENT', 'TRANSFER'];
const BALANCE_FIELDS = ['old_balance_orig', 'new_balance_orig', 'old_balance_dest', 'new_balance_dest'];
const VALID_ROLES = ['analyst', 'admin'];
const SALT_ROUNDS = 10;
const JWT_EXPIRY = '8h';

app.post('/transactions/ingest', requireApiKey, async (req, res) => {
  const transaction = req.body;
  const idempotencyKey = req.get('Idempotency-Key');

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency-Key header is required' });
  }

  if (!transaction || !transaction.amount) {
    return res.status(400).json({ error: 'Transaction must include at least an amount' });
  }

  if (typeof transaction.currency !== 'string' || transaction.currency.trim() === '') {
    return res.status(400).json({ error: 'currency is required' });
  }

  if (!VALID_TYPES.includes(transaction.type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  for (const field of BALANCE_FIELDS) {
    if (typeof transaction[field] !== 'number' || Number.isNaN(transaction[field])) {
      return res.status(400).json({ error: `${field} must be numeric` });
    }
  }

  transaction.idempotency_key = idempotencyKey;

  // jobId = idempotencyKey: BullMQ refuses to create a second job under an id that
  // already exists, so a client retrying the same request can't double-enqueue.
  const job = await transactionQueue.add('score-transaction', transaction, {
    jobId: idempotencyKey,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  res.status(202).json({ message: 'Transaction queued for scoring', jobId: job.id });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, email, password_hash, role FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    // Same generic error whether the email doesn't exist or the password is wrong -
    // never reveal which one it was.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ token });
  } catch (err) {
    console.error('POST /auth/login failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, passwordHash, role]
    );
    await logAudit(req.user.sub, 'create_user', 'user', result.insertId, { email, role });
    res.status(201).json({ id: result.insertId, email, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('POST /users failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const VALID_REVIEW_DECISIONS = ['confirmed_fraud', 'false_positive', 'escalated'];

app.get('/review-queue', requireAuth, async (req, res) => {
  try {
    // Oldest first: this is a work queue, not a feed - FIFO keeps a long-flagged
    // transaction from being buried under newer ones if analysts always work top-down.
    const [rows] = await pool.execute(
      `SELECT
         t.id, t.account_id, t.merchant_id, t.amount, t.currency, t.txn_timestamp,
         t.type, t.old_balance_orig, t.new_balance_orig, t.old_balance_dest, t.new_balance_dest,
         rs.score, rs.decision, rs.features_json, rs.shap_values_json, rs.scored_at
       FROM transactions t
       JOIN risk_scores rs ON rs.transaction_id = t.id
       LEFT JOIN analyst_reviews ar ON ar.transaction_id = t.id
       WHERE rs.decision = 'block' AND ar.id IS NULL
       ORDER BY rs.scored_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /review-queue failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/transactions/:id/review', requireAuth, async (req, res) => {
  const transactionId = req.params.id;
  const { decision, notes } = req.body || {};

  if (!VALID_REVIEW_DECISIONS.includes(decision)) {
    return res
      .status(400)
      .json({ error: `decision must be one of: ${VALID_REVIEW_DECISIONS.join(', ')}` });
  }

  try {
    const [txnRows] = await pool.execute('SELECT id FROM transactions WHERE id = ?', [transactionId]);
    if (txnRows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM analyst_reviews WHERE transaction_id = ?',
      [transactionId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This transaction has already been reviewed' });
    }

    const [result] = await pool.execute(
      `INSERT INTO analyst_reviews (transaction_id, analyst_id, decision, notes, reviewed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [transactionId, req.user.sub, decision, notes || null]
    );

    await logAudit(req.user.sub, 'review_transaction', 'transaction', transactionId, {
      decision,
      notes,
    });

    res.status(201).json({ id: result.insertId, transactionId, decision, notes });
  } catch (err) {
    // Race-condition backstop for the SELECT-then-INSERT check above: the UNIQUE
    // constraint on analyst_reviews.transaction_id (migration 012) is what actually
    // guarantees no two reviews land on the same transaction.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This transaction has already been reviewed' });
    }
    console.error('POST /transactions/:id/review failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});






