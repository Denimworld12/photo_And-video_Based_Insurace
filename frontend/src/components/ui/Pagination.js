import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Shared pager. Four screens each built their own, two of them labelling the
 * buttons with bare « and » glyphs that a screen reader announces as
 * punctuation and a small phone renders as a tap target under 24px.
 */
export default function Pagination({ page, totalPages, onChange, total }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-bone px-4 py-3 sm:flex-row"
    >
      <p className="text-caption text-bark">
        {total != null ? `${total.toLocaleString('en-IN')} results · ` : ''}
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="btn btn-outline btn-sm"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="btn btn-outline btn-sm"
        >
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
