const { Worker } = require('bullmq');
const mysql = require('mysql2/promise');
const axios = require('axios');
const { Server } = require('socket.io');

const REDIS_CONNECTION = { host: '127.0.0.1', port: 6379 };
const SCORING_SERVICE_URL = 'http://localhost:8000/score';
const SOCKET_PORT = 4001;
const DEFAULT_MODEL_VERSION_ID = 1;

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

const worker = new Worker(
  'transaction-scoring',
  async (job) => {
    const txn = job.data;
    console.log(`[job ${job.id}] received:`, txn);

    const features = {
      amount: txn.amount,
      merchant_id: txn.merchant_id,
      account_id: txn.account_id,
      currency: txn.currency,
      device_fingerprint: txn.device_fingerprint,
      geo_country: txn.geo_country,
    };

    const { data: scoreResult } = await axios.post(SCORING_SERVICE_URL, features);
    console.log(`[job ${job.id}] FastAPI scored:`, scoreResult);

    const [txnResult] = await pool.execute(
      `INSERT INTO transactions
        (account_id, merchant_id, amount, currency, txn_timestamp, device_fingerprint, geo_country)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        txn.account_id,
        txn.merchant_id,
        txn.amount,
        txn.currency || null,
        txn.txn_timestamp ? new Date(txn.txn_timestamp) : new Date(),
        txn.device_fingerprint || null,
        txn.geo_country || null,
      ]
    );
    const transactionId = txnResult.insertId;

    await pool.execute(
      `INSERT INTO risk_scores
        (transaction_id, model_version_id, score, decision, features_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        transactionId,
        txn.model_version_id || DEFAULT_MODEL_VERSION_ID,
        scoreResult.score,
        scoreResult.decision,
        JSON.stringify(features),
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
