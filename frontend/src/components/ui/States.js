import React from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * The three states every data-backed screen owes the user.
 *
 * Before this, most pages swallowed fetch errors (`catch { /* ignore *\/ }`)
 * and fell through to their empty state — so "the server is down" and "you
 * have no claims yet" looked identical, and the user had nothing to retry.
 */

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="h-7 w-7 animate-spin text-honey-amber" aria-hidden="true" />
      <p className="text-body text-bark">{label}</p>
    </div>
  );
}

export function ErrorState({ title = 'Could not load this page', message, onRetry, retryLabel = 'Try again' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-bone bg-parchment px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-saddle" aria-hidden="true" />
      <h2 className="text-subheading text-ink">{title}</h2>
      {message && <p className="max-w-md text-body text-bark">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-outline mt-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-loam bg-parchment px-6 py-16 text-center">
      {Icon && <Icon className="h-9 w-9 text-loam" aria-hidden="true" />}
      <h2 className="mt-1 text-subheading text-ink">{title}</h2>
      {message && <p className="max-w-sm text-body text-bark">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * Placeholder rows that hold the page's shape while a list loads, so the
 * layout does not jump when data lands.
 */
export function SkeletonList({ rows = 3 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-bone bg-pure-white p-4">
          <div className="h-3 w-1/3 animate-pulse rounded-md bg-bone" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded-md bg-bone" />
        </div>
      ))}
    </div>
  );
}
