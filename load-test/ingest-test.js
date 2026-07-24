import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const FRAUD_RATE = 0.05;

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up
    { duration: '60s', target: 20 }, // hold
    { duration: '30s', target: 0 }, // ramp down
  ],
  // k6's default summary only shows p90/p95 - this gets exactly what was asked for.
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  if (!__ENV.INGEST_API_KEY) {
    throw new Error(
      'INGEST_API_KEY env var is required - run with: k6 run -e INGEST_API_KEY=<key> ingest-test.js'
    );
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueIdempotencyKey() {
  return `loadtest-${__VU}-${__ITER}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ~5% fraud-shaped (TRANSFER, origin drained to 0, destination zeroed both sides -
// the classic pattern this project's model was trained to catch), ~95% benign
// (PAYMENT/CASH_IN, balances that move plausibly with the transaction amount).
function randomTransaction() {
  if (Math.random() < FRAUD_RATE) {
    const amount = randomInt(50000, 500000);
    return {
      type: 'TRANSFER',
      amount,
      currency: 'USD',
      old_balance_orig: amount,
      new_balance_orig: 0,
      old_balance_dest: 0,
      new_balance_dest: 0,
    };
  }

  const type = Math.random() < 0.5 ? 'PAYMENT' : 'CASH_IN';
  const amount = randomInt(10, 5000);
  const oldBalanceOrig = randomInt(amount, amount + 50000);
  const newBalanceOrig = type === 'PAYMENT' ? oldBalanceOrig - amount : oldBalanceOrig + amount;

  return {
    type,
    amount,
    currency: 'USD',
    old_balance_orig: oldBalanceOrig,
    new_balance_orig: newBalanceOrig,
    old_balance_dest: 0,
    new_balance_dest: 0,
  };
}

export default function () {
  const transaction = {
    account_id: 1,
    merchant_id: 1,
    ...randomTransaction(),
  };

  const res = http.post(`${BASE_URL}/transactions/ingest`, JSON.stringify(transaction), {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': __ENV.INGEST_API_KEY,
      'Idempotency-Key': uniqueIdempotencyKey(),
    },
  });

  check(res, {
    'status is 202': (r) => r.status === 202,
  });

  // Without this, a VU fires requests back-to-back with no think-time, turning
  // "20 VUs" into tens of thousands of req/s instead of a realistic ~20 req/s
  // peak - confirmed by a smoke test that hit 2,100+ req/s with just 2 VUs.
  sleep(1);
}
