import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Accessible modal shell.
 *
 * The claim-detail dialog previously rendered a bare `<dialog class="modal-open">`:
 * Escape did nothing, the page behind kept scrolling, and focus stayed wherever
 * it happened to be. Everything that opens over the page now goes through here.
 */
export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-3xl' }[size] || 'max-w-2xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative flex max-h-[92vh] w-full ${width} flex-col rounded-t-lg border border-bone bg-pure-white sm:rounded-lg`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-bone px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-subheading text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate font-mono text-caption text-bark">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="btn btn-ghost btn-sm btn-circle shrink-0 text-bark"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && <footer className="border-t border-bone px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
