const TYPE_LABELS = {
  CASH_IN: 'Cash In',
  CASH_OUT: 'Cash Out',
  DEBIT: 'Debit',
  PAYMENT: 'Payment',
  TRANSFER: 'Transfer',
};

const TRANSACTION_TYPES = Object.keys(TYPE_LABELS);

export function FilterBar({ minScore, onMinScoreChange, type, onTypeChange, hasActiveFilters, onReset }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-5 rounded-md border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-3">
        <label htmlFor="min-score" className="text-xs text-ink-muted">
          Min score
        </label>
        <input
          id="min-score"
          type="range"
          min={0}
          max={99}
          step={1}
          value={minScore}
          onChange={(e) => onMinScoreChange(Number(e.target.value))}
          className="h-1 w-32 accent-brass"
        />
        <span className="w-10 font-mono text-xs tabular-nums text-ink">{minScore}%</span>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="type-filter" className="text-xs text-ink-muted">
          Type
        </label>
        <select
          id="type-filter"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="rounded border border-border bg-abyss px-2 py-1 text-xs text-ink outline-none transition-colors focus:border-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          <option value="all">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-ink-muted underline decoration-border transition-colors hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}
