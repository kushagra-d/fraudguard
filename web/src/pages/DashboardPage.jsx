import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';
import { TransactionRow } from '../components/TransactionRow';

export function DashboardPage() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/review-queue', { token })
      .then(setTransactions)
      .catch((err) => setError(err.message));
  }, [token]);

  function handleResolved(id) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Review Queue
          </h1>
          {transactions && (
            <span className="font-mono text-xs text-zinc-500">
              {transactions.length} pending
            </span>
          )}
        </div>

        {error && (
          <p className="rounded border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {!error && transactions === null && (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}

        {transactions && transactions.length === 0 && (
          <p className="text-sm text-zinc-500">Nothing flagged for review right now.</p>
        )}

        {transactions && transactions.length > 0 && (
          <div className="grid grid-cols-[80px_100px_140px_90px_90px_100px] gap-4 px-4 pb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
            <span>ID</span>
            <span>Type</span>
            <span>Amount</span>
            <span>Score</span>
            <span>Decision</span>
            <span className="text-right">Scored</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {transactions?.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onResolved={handleResolved}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
