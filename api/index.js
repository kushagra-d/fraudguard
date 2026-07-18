require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Queue } = require('bullmq');

const app = express();
app.use(cors());
app.use(express.json());

const connection = { host: '127.0.0.1', port: 6379 };
const transactionQueue = new Queue('transaction-scoring', { connection });

app.post('/transactions/ingest', async (req, res) => {
  const transaction = req.body;

  if (!transaction || !transaction.amount) {
    return res.status(400).json({ error: 'Transaction must include at least an amount' });
  }

  const job = await transactionQueue.add('score-transaction', transaction);

  res.status(202).json({ message: 'Transaction queued for scoring', jobId: job.id });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});


