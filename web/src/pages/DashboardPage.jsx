import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useReviewSocket } from '../hooks/useReviewSocket';
import { toQueueRow } from '../lib/socketAlerts';
import { Header } from '../components/Header';
import { TransactionRow } from '../components/TransactionRow';
import { FilterBar } from '../components/FilterBar';

const NEW_ALERT_HIGHLIGHT_MS = 2000;

export function DashboardPage() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState(null);
  const [newlyArrivedIds, setNewlyArrivedIds] = useState(() => new Set());
  const highlightTimeouts = useRef(new Map());
  const [minScore, setMinScore] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');

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

  const hasActiveFilters = minScore > 0 || typeFilter !== 'all';

  const filteredTransactions = transactions?.filter((t) => {
    if (t.score * 100 < minScore) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    return true;
  });

  function handleResetFilters() {
    setMinScore(0);
    setTypeFilter('all');
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-abyss">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[140px]"
        style={{ backgroundColor: 'var(--color-brass)' }}
      />

      <Header />

      <main className="relative mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between border-b border-border pb-3">
          <h1 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
            Review Queue
          </h1>
          {transactions && (
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {hasActiveFilters
                ? `${filteredTransactions.length} of ${transactions.length} pending`
                : `${transactions.length} pending`}
            </span>
          )}
        </div>

        {error && (
          <p className="rounded border border-alarm/40 bg-alarm-bg px-4 py-3 text-sm text-alarm">
            {error}
          </p>
        )}

        {!error && transactions === null && (
          <p className="text-sm text-ink-muted">Loading...</p>
        )}

        {transactions && transactions.length > 0 && (
          <FilterBar
            minScore={minScore}
            onMinScoreChange={setMinScore}
            type={typeFilter}
            onTypeChange={setTypeFilter}
            hasActiveFilters={hasActiveFilters}
            onReset={handleResetFilters}
          />
        )}

        {transactions && transactions.length === 0 && (
          <p className="text-sm text-ink-muted">Nothing flagged for review right now.</p>
        )}

        {transactions && transactions.length > 0 && filteredTransactions.length === 0 && (
          <p className="text-sm text-ink-muted">No transactions match the current filters.</p>
        )}

        {filteredTransactions && filteredTransactions.length > 0 && (
          <div className="grid grid-cols-[80px_100px_140px_90px_90px_100px] gap-4 px-4 pb-2 text-xs font-medium uppercase tracking-wide text-ink-muted/70">
            <span>ID</span>
            <span>Type</span>
            <span>Amount</span>
            <span>Score</span>
            <span>Decision</span>
            <span className="text-right">Scored</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {filteredTransactions?.map((transaction) => (
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
