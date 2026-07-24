const mysql = require('mysql2/promise');

function parseMinutesArg() {
  const flagIndex = process.argv.indexOf('--minutes');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return Number(process.argv[flagIndex + 1]);
  }
  return 15;
}

function percentile(sortedValues, p) {
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

async function main() {
  const minutes = parseMinutesArg();

  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'devpassword',
    database: 'fraudguard',
  });

  // End-to-end scoring latency: time from when the worker inserted the transaction
  // row to when it inserted the matching risk_scores row. This is what k6 CANNOT
  // see - k6 only measures the ingest endpoint's response time, which returns as
  // soon as the job is queued, before scoring even starts.
  const [rows] = await pool.execute(
    `SELECT TIMESTAMPDIFF(MICROSECOND, t.created_at, rs.scored_at) / 1000.0 AS latency_ms
     FROM transactions t
     JOIN risk_scores rs ON rs.transaction_id = t.id
     WHERE t.created_at >= (NOW() - INTERVAL ? MINUTE)`,
    [minutes]
  );
  await pool.end();

  if (rows.length === 0) {
    console.log(`No scored transactions found in the last ${minutes} minute(s).`);
    return;
  }

  const latencies = rows.map((r) => Number(r.latency_ms)).sort((a, b) => a - b);
  const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;

  console.log(`Scoring latency over the last ${minutes} minute(s) (transactions.created_at -> risk_scores.scored_at)`);
  console.log(`  count: ${latencies.length}`);
  console.log(`  avg:   ${avg.toFixed(1)} ms`);
  console.log(`  p95:   ${percentile(latencies, 95).toFixed(1)} ms`);
  console.log(`  min:   ${latencies[0].toFixed(1)} ms`);
  console.log(`  max:   ${latencies[latencies.length - 1].toFixed(1)} ms`);
}

main().catch((err) => {
  console.error('Failed to measure scoring latency:', err.message);
  process.exitCode = 1;
});
