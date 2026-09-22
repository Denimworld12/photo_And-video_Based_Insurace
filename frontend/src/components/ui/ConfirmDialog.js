import React from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';

/**
 * Confirmation step for an action the user cannot undo from the UI.
 *
 * Replaces window.confirm(), and covers the actions that previously ran on a
 * single click with no confirmation at all: submitting a claim, approving or
 * rejecting one, deactivating a farmer's account, deleting a policy.
 *
 * `summary` takes the concrete facts of what is about to happen — which
 * farmer, which amount, which policy — because "Are you sure?" on its own
 * tells the user nothing they can actually check.
 */
export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  summary,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  tone = 'primary',
}) {
  const confirmClass = tone === 'danger' ? 'btn btn-error' : 'btn btn-primary';

  return (
    <Modal open={open} onClose={busy ? () => {} : onCancel} title={title} size="sm">
      {description && <p className="text-body text-saddle">{description}</p>}

      {summary?.length > 0 && (
        <dl className="mt-4 divide-y divide-bone rounded-lg border border-bone bg-parchment px-4">
          {summary.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="label-micro">{row.label}</dt>
              <dd className="text-right text-body font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-outline">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={confirmClass}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
