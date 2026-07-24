import { FEATURE_LABELS } from '../lib/featureLabels';

// Colors re-validated for this specific palette (not assumed from the prior
// red-500/emerald-600 pair) against the Slate surface (#171D26) with the
// dataviz skill's validator: lightness band, chroma floor, contrast, and CVD
// separation (deutan ΔE 8.5) all pass. These are Alarm/Verified - the same
// semantic pair used in the decision badge - kept consistent across the app.
const POSITIVE_COLOR = 'bg-alarm'; // pushes toward fraud
const NEGATIVE_COLOR = 'bg-verified'; // pushes toward not-fraud

function formatSigned(value) {
  const sign = value > 0 ? '+' : value < 0 ? '' : ' ';
  return `${sign}${value.toFixed(2)}`;
}

export function ShapBarChart({ shapValues }) {
  const { base_value: baseValue, ...features } = shapValues || {};

  const rows = Object.entries(features)
    .map(([key, value]) => ({ key, label: FEATURE_LABELS[key] || key, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);

  return (
    <div className="rounded-lg border border-brass/30 bg-abyss/60 p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-brass">
          Feature Contributions
        </h3>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          baseline {formatSigned(baseValue)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const isPositive = row.value >= 0;
          const halfPercent = (Math.abs(row.value) / maxAbs) * 50;
          return (
            <div
              key={row.key}
              className="grid grid-cols-[160px_1fr_64px] items-center gap-3"
              title={`${row.label}: ${formatSigned(row.value)}`}
            >
              <span className="truncate text-xs text-ink-muted">{row.label}</span>
              <div className="relative h-4">
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                <div
                  className={`absolute inset-y-0 ${
                    isPositive
                      ? `left-1/2 rounded-r-sm ${POSITIVE_COLOR}`
                      : `right-1/2 rounded-l-sm ${NEGATIVE_COLOR}`
                  }`}
                  style={{ width: `${halfPercent}%` }}
                />
              </div>
              <span className="text-right font-mono text-xs tabular-nums text-ink">
                {formatSigned(row.value)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-sm ${POSITIVE_COLOR}`} />
          pushes toward fraud
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-sm ${NEGATIVE_COLOR}`} />
          pushes toward not-fraud
        </span>
      </div>
    </div>
  );
}
