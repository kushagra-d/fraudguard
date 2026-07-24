import { FEATURE_LABELS } from '../lib/featureLabels';

// Colors validated against this app's dark card surface (#18181b) with the
// dataviz skill's palette validator: lightness band, chroma floor, contrast,
// and CVD separation (deutan ΔE 9.6) all pass. Same red/emerald families as the
// existing block/allow badge, tuned to different steps because the badge's
// -400 steps are text-on-a-colored-chip, not a bar fill on the card surface.
const POSITIVE_COLOR = 'bg-red-500'; // pushes toward fraud
const NEGATIVE_COLOR = 'bg-emerald-600'; // pushes toward not-fraud

function formatSigned(value) {
  const sign = value > 0 ? '+' : value < 0 ? '' : ' ';
  return `${sign}${value.toFixed(2)}`;
}

export function ShapBarChart({ shapValues }) {
  const { base_value: baseValue, ...features } = shapValues || {};

  const rows = Object.entries(features)
    .map(([key, value]) => ({ key, label: FEATURE_LABELS[key] || key, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Feature contributions (SHAP)
        </h3>
        <span className="font-mono text-xs text-zinc-600">
          baseline {formatSigned(baseValue)}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const isPositive = row.value >= 0;
          const halfPercent = (Math.abs(row.value) / maxAbs) * 50;
          return (
            <div
              key={row.key}
              className="grid grid-cols-[160px_1fr_60px] items-center gap-2"
              title={`${row.label}: ${formatSigned(row.value)}`}
            >
              <span className="truncate text-xs text-zinc-400">{row.label}</span>
              <div className="relative h-4">
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-700" />
                <div
                  className={`absolute inset-y-0 ${
                    isPositive ? `left-1/2 rounded-r-sm ${POSITIVE_COLOR}` : `right-1/2 rounded-l-sm ${NEGATIVE_COLOR}`
                  }`}
                  style={{ width: `${halfPercent}%` }}
                />
              </div>
              <span className="text-right font-mono text-xs text-zinc-300">
                {formatSigned(row.value)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-500">
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
