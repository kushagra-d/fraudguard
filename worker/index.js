const { Worker } = require('bullmq');
const mysql = require('mysql2/promise');
const axios = require('axios');
const { Server } = require('socket.io');

const REDIS_CONNECTION = { host: '127.0.0.1', port: 6379 };
const SCORING_SERVICE_URL = 'http://localhost:8000/score';
const SOCKET_PORT = 4001;

const io = new Server(SOCKET_PORT, {
  cors: { origin: '*' },
});
console.log(`Socket.io server listening on port ${SOCKET_PORT}`);

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'devpassword',
  database: 'fraudguard',
});

// version string -> model_versions.id. The active model rarely changes while this
// process runs, so caching avoids a DB round-trip on every job. Prefetched at startup
// below; resolveModelVersionId() falls back to a live query on a cache miss, so a
// version registered after startup still resolves without a worker restart.
const modelVersionCache = new Map();

async function resolveModelVersionId(version) {
  if (modelVersionCache.has(version)) {
    return modelVersionCache.get(version);
  }
  const [rows] = await pool.execute('SELECT id FROM model_versions WHERE version = ?', [version]);
  if (rows.length === 0) {
    throw new Error(`No model_versions row found for version "${version}"`);
  }
  const id = rows[0].id;
  modelVersionCache.set(version, id);
  return id;
}

async function prefetchModelVersions() {
  const [rows] = await pool.execute('SELECT id, version FROM model_versions');
  for (const row of rows) {
    modelVersionCache.set(row.version, row.id);
  }
  console.log(`Prefetched ${rows.length} model_versions into cache`);
}

prefetchModelVersions().catch((err) => {
  console.error('Failed to prefetch model_versions:', err.message);
});

const worker = new Worker(
  'transaction-scoring',
  async (job) => {
    const txn = job.data;
    console.log(`[job ${job.id}] received:`, txn);

    const scoringPayload = {
      type: txn.type,
      amount: txn.amount,
      old_balance_orig: txn.old_balance_orig,
      new_balance_orig: txn.new_balance_orig,
      old_balance_dest: txn.old_balance_dest,
      new_balance_dest: txn.new_balance_dest,
    };

    const { data: scoreResult } = await axios.post(SCORING_SERVICE_URL, scoringPayload);
    console.log(`[job ${job.id}] FastAPI scored:`, scoreResult);

    const [txnResult] = await pool.execute(
      `INSERT INTO transactions
        (account_id, merchant_id, amount, currency, txn_timestamp, device_fingerprint, geo_country,
         type, old_balance_orig, new_balance_orig, old_balance_dest, new_balance_dest)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txn.account_id,
        txn.merchant_id,
        txn.amount,
        txn.currency || null,
        txn.txn_timestamp ? new Date(txn.txn_timestamp) : new Date(),
        txn.device_fingerprint || null,
        txn.geo_country || null,
        txn.type,
        txn.old_balance_orig,
        txn.new_balance_orig,
        txn.old_balance_dest,
        txn.new_balance_dest,
      ]
    );
    const transactionId = txnResult.insertId;
    const modelVersionId = await resolveModelVersionId(scoreResult.model_version);

    await pool.execute(
      `INSERT INTO risk_scores
        (transaction_id, model_version_id, score, decision, features_json, shap_values_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        modelVersionId,
        scoreResult.score,
        scoreResult.decision,
        JSON.stringify(scoreResult.features_used),
        JSON.stringify(scoreResult.shap_values),
      ]
    );
    console.log(`[job ${job.id}] DB write done: transaction #${transactionId}`);

    return { transactionId, transaction: txn, score: scoreResult };
  },
  { connection: REDIS_CONNECTION }
);

worker.on('completed', (job, result) => {
  io.emit('new-alert', result);
  console.log(`[job ${job.id}] socket emitted: new-alert`);
});

worker.on('failed', (job, err) => {
  console.error(`[job ${job?.id}] failed:`, err.message);
});

console.log('Worker listening on queue "transaction-scoring"');
