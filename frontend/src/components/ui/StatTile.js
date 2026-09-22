import React from 'react';

/**
 * A single figure with its label.
 *
 * Replaces daisyUI's `stats` block, which shipped a drop shadow, forced a
 * horizontal row that overflowed below ~380px, and rendered each figure in a
 * different saturated colour. Here the figure is ink, the label is bark, and
 * the tiles separate by hairline only.
 */
export default function StatTile({ label, value, hint, icon: Icon, emphasis = false }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-4 ${
        emphasis ? 'border-honey-amber bg-honey-amber/15' : 'border-bone bg-pure-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="label-micro">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-bark" aria-hidden="true" />}
      </div>
      <p className="text-heading-sm text-ink">{value}</p>
      {hint && <p className="text-caption text-bark">{hint}</p>}
    </div>
  );
}

/** A labelled progress bar, on-palette and with an accessible role. */
export function Meter({ label, value, max = 100, caption }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / max) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-micro">{label}</span>
        <span className="text-body font-medium text-ink">{caption ?? `${pct.toFixed(0)}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-md bg-bone"
      >
        <div className="h-full rounded-md bg-honey-amber" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
