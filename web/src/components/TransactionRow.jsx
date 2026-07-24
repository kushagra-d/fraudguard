import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatRelativeTime } from '../lib/time';
import { FEATURE_LABELS } from '../lib/featureLabels';
import { ShapBarChart } from './ShapBarChart';

const RAW_GRID_KEYS = [
  'amount',
  'oldbalanceOrg',
  'newbalanceOrig',
  'oldbalanceDest',
  'newbalanceDest',
  'destBalanceZeroed',
];

function formatMoney(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function DecisionBadge({ decision }) {
  const isBlock = decision === 'block';
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-xs font-medium ${
        isBlock ? 'bg-red-950 text-red-400' : 'bg-emerald-950 text-emerald-400'
      }`}
    >
      {decision}
    </span>
  );
}

export function TransactionRow({ transaction, onResolved, isNew }) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showRawValues, setShowRawValues] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [resolutionMessage, setResolutionMessage] = useState(null);
  const resolutionTimeout = useRef(null);

  useEffect(() => {
    return () => {
      if (resolutionTimeout.current) clearTimeout(resolutionTimeout.current);
    };
  }, []);

  async function submitReview(decision) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/transactions/${transaction.id}/review`, {
        method: 'POST',
        token,
        body: { decision, notes: notes || undefined },
      });
      onResolved(transaction.id);
    } catch (err) {
      if (err.status === 409) {
        // Another analyst already reviewed this one - not an error worth blocking
        // on, just make it visible for a moment before it drops out of the queue.
        setResolutionMessage('Already reviewed by another analyst - removing from queue.');
        resolutionTimeout.current = setTimeout(() => onResolved(transaction.id), 1800);
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (resolutionMessage) {
    return (
      <div className="rounded border border-amber-900 bg-amber-950/50 px-4 py-3 text-xs text-amber-400">
        {resolutionMessage}
      </div>
    );
  }

  return (
    <div
      className={`rounded border transition-colors duration-[2000ms] ${
        isNew ? 'border-sky-700 bg-sky-950/40' : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[80px_100px_140px_90px_90px_100px] items-center gap-4 px-4 py-3 text-left hover:bg-zinc-800/50"
      >
        <span className="font-mono text-sm text-zinc-300">#{transaction.id}</span>
        <span className="text-sm text-zinc-400">{transaction.type}</span>
        <span className="font-mono text-sm text-zinc-200">
          {formatMoney(transaction.amount)}
          {transaction.currency ? ` ${transaction.currency}` : ''}
        </span>
        <span className="font-mono text-sm text-zinc-200">
          {(transaction.score * 100).toFixed(2)}%
        </span>
        <DecisionBadge decision={transaction.decision} />
        <span className="text-right text-xs text-zinc-500">
          {formatRelativeTime(transaction.scored_at)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4">
          {transaction.shap_values_json ? (
            <ShapBarChart shapValues={transaction.shap_values_json} />
          ) : (
            <p className="text-xs text-zinc-500">No SHAP values recorded for this transaction.</p>
          )}

          <button
            onClick={() => setShowRawValues((v) => !v)}
            className="mb-3 mt-4 text-xs text-zinc-500 underline decoration-zinc-700 hover:text-zinc-300"
          >
            {showRawValues ? 'Hide' : 'Show'} raw feature values
          </button>

          {showRawValues && (
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
              {Object.entries(transaction.features_json || {})
                .filter(([key]) => RAW_GRID_KEYS.includes(key))
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-zinc-800/60 py-1">
                    <dt className="text-xs text-zinc-500">{FEATURE_LABELS[key]}</dt>
                    <dd className="font-mono text-xs text-zinc-200">
                      {key === 'destBalanceZeroed' ? (value ? 'Yes' : 'No') : formatMoney(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />

          {error && (
            <p className="mb-3 rounded border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => submitReview('false_positive')}
              disabled={submitting}
              className="rounded border border-emerald-800 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900 disabled:opacity-50"
            >
              Mark False Positive
            </button>
            <button
              onClick={() => submitReview('confirmed_fraud')}
              disabled={submitting}
              className="rounded border border-red-800 bg-red-950 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900 disabled:opacity-50"
            >
              Confirm Fraud
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
