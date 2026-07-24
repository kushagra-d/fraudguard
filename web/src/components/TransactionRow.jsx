import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatRelativeTime } from '../lib/time';
import { FEATURE_LABELS } from '../lib/featureLabels';
import { ShapBarChart } from './ShapBarChart';

// Scores at or above this read as the highest-priority triage signal, distinct
// from the decision badge (which only tells you the automated block/allow call).
const CRITICAL_SCORE = 0.9;

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
        isBlock ? 'bg-alarm-bg text-alarm' : 'bg-verified-bg text-verified'
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
      <div className="rounded-md border border-brass/40 bg-brass/10 px-4 py-3 text-xs text-brass shadow-card">
        {resolutionMessage}
      </div>
    );
  }

  const isBlock = transaction.decision === 'block';

  return (
    <div
      className={`relative overflow-hidden rounded-md border shadow-card transition-colors duration-[2000ms] ${
        isNew ? 'border-brass bg-brass/10' : 'border-border bg-surface'
      }`}
    >
      {/* Severity stripe - decision reads at a glance from the left edge, not
          just from the badge text further along the row. */}
      <div
        className={`absolute inset-y-0 left-0 w-1 ${isBlock ? 'bg-alarm' : 'bg-verified'}`}
        aria-hidden="true"
      />

      <button
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[80px_100px_140px_90px_90px_100px] items-center gap-4 py-3 pl-6 pr-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brass"
      >
        <span className="font-mono text-sm tabular-nums text-ink">#{transaction.id}</span>
        <span className="text-sm text-ink-muted">{transaction.type}</span>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatMoney(transaction.amount)}
          {transaction.currency ? ` ${transaction.currency}` : ''}
        </span>
        <span
          className={`font-mono text-sm tabular-nums ${
            transaction.score >= CRITICAL_SCORE ? 'font-semibold text-alarm' : 'text-ink'
          }`}
        >
          {(transaction.score * 100).toFixed(2)}%
        </span>
        <DecisionBadge decision={transaction.decision} />
        <span className="text-right text-xs text-ink-muted">
          {formatRelativeTime(transaction.scored_at)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border py-4 pl-6 pr-4">
          {transaction.shap_values_json ? (
            <ShapBarChart shapValues={transaction.shap_values_json} />
          ) : (
            <p className="text-xs text-ink-muted">No SHAP values recorded for this transaction.</p>
          )}

          <button
            onClick={() => setShowRawValues((v) => !v)}
            className="mb-3 mt-4 text-xs text-ink-muted underline decoration-border transition-colors hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            {showRawValues ? 'Hide' : 'Show'} raw feature values
          </button>

          {showRawValues && (
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
              {Object.entries(transaction.features_json || {})
                .filter(([key]) => RAW_GRID_KEYS.includes(key))
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-border/60 py-1">
                    <dt className="text-xs text-ink-muted">{FEATURE_LABELS[key]}</dt>
                    <dd className="font-mono text-xs tabular-nums text-ink">
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
            className="mb-3 w-full rounded border border-border bg-abyss px-3 py-2 text-sm text-ink outline-none focus:border-brass"
          />

          {error && (
            <p className="mb-3 rounded border border-alarm/40 bg-alarm-bg px-3 py-2 text-xs text-alarm">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => submitReview('false_positive')}
              disabled={submitting}
              className="rounded border border-verified/40 bg-verified-bg px-3 py-1.5 text-xs font-medium text-verified transition-colors hover:brightness-125 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verified"
            >
              Mark False Positive
            </button>
            <button
              onClick={() => submitReview('confirmed_fraud')}
              disabled={submitting}
              className="rounded border border-alarm/40 bg-alarm-bg px-3 py-1.5 text-xs font-medium text-alarm transition-colors hover:brightness-125 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alarm"
            >
              Confirm Fraud
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
