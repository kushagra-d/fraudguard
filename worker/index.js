require('dotenv').config();
const { Worker } = require('bullmq');
const mysql = require('mysql2/promise');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

// Railway's Redis plugin exposes one bundled REDIS_URL rather than separate
// host/port vars. BullMQ's `connection` option only accepts an options object
// or a real ioredis instance - not a raw URL string, which it would otherwise
// mangle via Object.assign - so a URL is parsed into the same object shape the
// host/port fallback already produces, rather than passed through as-is.
function parseRedisUrl(url) {
  const parsed = new URL(url);
  const options = {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  if (parsed.pathname && parsed.pathname.length > 1) {
    options.db = Number(parsed.pathname.slice(1));
  }
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

const REDIS_CONNECTION = {
  ...(process.env.REDIS_URL
    ? parseRedisUrl(process.env.REDIS_URL)
    : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
      }),
  // Allows both IPv4 and IPv6 resolution - Railway's internal network can
  // return AAAA records that ioredis's IPv4-only default (family: 4) rejects.
  family: 0,
};
const WORKER_ID = process.env.WORKER_ID || 'worker';
const WORKER_CONCURRENCY = 5;

// Round-robin across scoring-service instances so a single instance can't
// bottleneck job throughput once multiple workers are running concurrently.
const SCORING_SERVICE_URLS = (process.env.SCORING_SERVICE_URLS || 'http://localhost:8000')
  .split(',')
  .map((url) => url.trim());
let nextScoringServiceIndex = 0;
function getNextScoringServiceUrl() {
  const url = SCORING_SERVICE_URLS[nextScoringServiceIndex];
  nextScoringServiceIndex = (nextScoringServiceIndex + 1) % SCORING_SERVICE_URLS.length;
  return url;
}

const SOCKET_PORT = Number(process.env.SOCKET_PORT) || 4001;

// Comma-separated so the Dockerized web build and a local Vite dev server can
// both reach this worker's socket at once, same pattern as SCORING_SERVICE_URLS.
const DASHBOARD_ORIGINS = (process.env.DASHBOARD_ORIGIN || 'http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim());

const io = new Server(SOCKET_PORT, {
  cors: { origin: DASHBOARD_ORIGINS },
});

// The Redis adapter is what makes io.to('analysts').emit(...) reach clients
// connected to ANY worker process's Socket.io server, not just the process that
// happened to process this particular job - without it, a dashboard connected
// only to worker-1 would never see alerts for jobs worker-2/3 processed. The
// adapter requires two separate connections (pub can't also be sub).
const pubClient = new Redis(REDIS_CONNECTION);
const subClient = pubClient.duplicate();
pubClient.on('error', (err) => console.error(`[${WORKER_ID}] Redis pub client error:`, err.message));
subClient.on('error', (err) => console.error(`[${WORKER_ID}] Redis sub client error:`, err.message));
io.adapter(createAdapter(pubClient, subClient));

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Missing auth token'));
  }
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  socket.join('analysts');
  console.log(`[${WORKER_ID}] Socket ${socket.id} authenticated as ${socket.user.email}, joined "analysts" room`);
});

console.log(`[${WORKER_ID}] Socket.io server listening on port ${SOCKET_PORT}`);

// A connectionLimit of 1 (or a single createConnection()) would silently
// serialize concurrent job processing at the DB layer even with BullMQ's
// concurrency set above 1 - each job's queries would queue on that one
// connection, so "5 jobs running concurrently" would still mean 5 jobs taking
// turns on the database. The pool has to actually have room for concurrent
// connections, not just BullMQ being told to run jobs concurrently.
const MYSQL_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;

const pool = mysql.createPool({
  ...(MYSQL_URL
    ? { uri: MYSQL_URL }
    : {
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'devpassword',
        database: process.env.MYSQL_DATABASE || 'fraudguard',
      }),
  connectionLimit: 10,
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
  console.log(`[${WORKER_ID}] Prefetched ${rows.length} model_versions into cache`);
}

prefetchModelVersions().catch((err) => {
  console.error(`[${WORKER_ID}] Failed to prefetch model_versions:`, err.message);
});

const worker = new Worker(
  'transaction-scoring',
  async (job) => {
    const txn = job.data;
    console.log(`[${WORKER_ID}] [job ${job.id}] received:`, txn);

    const scoringPayload = {
      type: txn.type,
      amount: txn.amount,
      old_balance_orig: txn.old_balance_orig,
      new_balance_orig: txn.new_balance_orig,
      old_balance_dest: txn.old_balance_dest,
      new_balance_dest: txn.new_balance_dest,
    };
    // Testing-only: forwarded so the /score simulate-failure hook is reachable
    // through the real ingest pipeline, not just by curling scoring-service directly.
    if (txn._simulate_failure) {
      scoringPayload._simulate_failure = txn._simulate_failure;
    }

    const scoringServiceUrl = getNextScoringServiceUrl();
    const { data: scoreResult } = await axios.post(`${scoringServiceUrl}/score`, scoringPayload);
    console.log(`[${WORKER_ID}] [job ${job.id}] scored via ${scoringServiceUrl}:`, scoreResult);

    let transactionId;
    try {
      const [txnResult] = await pool.execute(
        `INSERT INTO transactions
          (account_id, merchant_id, amount, currency, txn_timestamp, device_fingerprint, geo_country,
           type, old_balance_orig, new_balance_orig, old_balance_dest, new_balance_dest, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          txn.idempotency_key,
        ]
      );
      transactionId = txnResult.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        console.log(
          `[${WORKER_ID}] [job ${job.id}] idempotency_key="${txn.idempotency_key}" already exists - ` +
            `already processed by an earlier attempt, skipping re-insert`
        );
        return { duplicate: true, idempotencyKey: txn.idempotency_key };
      }
      throw err;
    }

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
    console.log(`[${WORKER_ID}] [job ${job.id}] DB write done: transaction #${transactionId}`);

    return { transactionId, transaction: txn, scoreResult };
  },
  { connection: REDIS_CONNECTION, concurrency: WORKER_CONCURRENCY }
);

worker.on('completed', (job, result) => {
  if (result && result.duplicate) {
    console.log(`[${WORKER_ID}] [job ${job.id}] duplicate - no new-alert emitted`);
    return;
  }
  if (result.scoreResult.decision !== 'block') {
    console.log(`[${WORKER_ID}] [job ${job.id}] decision=${result.scoreResult.decision} - not broadcast, nothing to review`);
    return;
  }
  io.to('analysts').emit('new-alert', result);
  console.log(`[${WORKER_ID}] [job ${job.id}] socket emitted: new-alert`);
});

worker.on('failed', async (job, err) => {
  console.error(`[${WORKER_ID}] [job ${job?.id}] failed:`, err.message);

  if (!job) return;

  const maxAttempts = job.opts.attempts || 1;
  if (job.attemptsMade < maxAttempts) {
    console.log(`[${WORKER_ID}] [job ${job.id}] attempt ${job.attemptsMade}/${maxAttempts} - will retry`);
    return;
  }

  console.log(`[${WORKER_ID}] [job ${job.id}] exhausted all ${maxAttempts} attempts - writing to failed_transactions`);
  try {
    await pool.execute(
      `INSERT INTO failed_transactions (idempotency_key, payload_json, error_message, attempts_made)
       VALUES (?, ?, ?, ?)`,
      [job.data.idempotency_key || null, JSON.stringify(job.data), err.message, job.attemptsMade]
    );
  } catch (insertErr) {
    console.error(`[${WORKER_ID}] [job ${job.id}] failed to write failed_transactions row:`, insertErr.message);
  }
});

console.log(
  `[${WORKER_ID}] Worker listening on queue "transaction-scoring" ` +
    `(concurrency=${WORKER_CONCURRENCY}, scoring targets: ${SCORING_SERVICE_URLS.join(', ')})`
);
