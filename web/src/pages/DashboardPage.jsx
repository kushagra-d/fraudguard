import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useReviewSocket } from '../hooks/useReviewSocket';
import { toQueueRow } from '../lib/socketAlerts';
import { Header } from '../components/Header';
import { TransactionRow } from '../components/TransactionRow';

const NEW_ALERT_HIGHLIGHT_MS = 2000;

export function DashboardPage() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState(() => new Set());
  const highlightTimeouts = useRef(new Map());

  const fetchQueue = useCallback(() => {
    return apiFetch('/review-queue', { token })
      .then(setTransactions)
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Every highlight timeout this component starts gets tracked here so unmount
  // can clear whichever ones are still pending - without this, a setState from
  // a timeout firing after unmount logs React's set-state-after-unmount warning.
  useEffect(() => {
    return () => {
      for (const timeoutId of highlightTimeouts.current.values()) {
        clearTimeout(timeoutId);
      }
      highlightTimeouts.current.clear();
    };
  }, []);

  const handleNewAlert = useCallback((payload) => {
    const row = toQueueRow(payload);

    setTransactions((prev) => {
      if (!prev) return [row];
      if (prev.some((t) => t.id === row.id)) return prev; // dedupe
      return [...prev, row];
    });

    setNewlyArrivedIds((prev) => {
      const next = new Set(prev);
      next.add(row.id);
      return next;
    });

    const timeoutId = setTimeout(() => {
      setNewlyArrivedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      highlightTimeouts.current.delete(row.id);
    }, NEW_ALERT_HIGHLIGHT_MS);
    highlightTimeouts.current.set(row.id, timeoutId);
  }, []);

  useReviewSocket(token, { onNewAlert: handleNewAlert, onReconnect: fetchQueue });

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
              isNew={newlyArrivedIds.has(transaction.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
