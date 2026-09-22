import React from 'react';
import { Clock, CheckCircle2, XCircle, Eye, Banknote, FileText, Loader2 } from 'lucide-react';

/**
 * One vocabulary for claim status, shared by both portals.
 *
 * Five screens each carried their own status map, and they disagreed: the
 * backend emits both `manual_review` and `manual-review`, and both
 * `payout_pending` and `payout-pending`, so the same claim could render as
 * "Under Review" on one page and fall through to an unlabelled grey chip on
 * the next. Keys are normalised here once.
 *
 * Status is never carried by colour alone — each state has an icon and a
 * word, which also keeps it legible in the palette's narrow colour range.
 */

const STATUS = {
  draft: { label: 'Draft', Icon: FileText, tone: 'border-loam bg-parchment text-bark' },
  submitted: { label: 'Submitted', Icon: Clock, tone: 'border-bark bg-bark/10 text-saddle' },
  processing: { label: 'Processing', Icon: Loader2, tone: 'border-wheat bg-wheat/25 text-saddle' },
  manualreview: { label: 'Under Review', Icon: Eye, tone: 'border-honey-amber bg-honey-amber/25 text-saddle' },
  fieldverification: { label: 'Field Check', Icon: Eye, tone: 'border-honey-amber bg-honey-amber/25 text-saddle' },
  approved: { label: 'Approved', Icon: CheckCircle2, tone: 'border-sage bg-sage/20 text-deep-olive' },
  rejected: { label: 'Rejected', Icon: XCircle, tone: 'border-saddle bg-saddle/10 text-saddle' },
  payoutpending: { label: 'Payout Pending', Icon: Banknote, tone: 'border-deep-olive bg-deep-olive/10 text-deep-olive' },
  payoutcomplete: { label: 'Paid', Icon: CheckCircle2, tone: 'border-sage bg-sage/20 text-deep-olive' },
  disputed: { label: 'Disputed', Icon: XCircle, tone: 'border-saddle bg-saddle/10 text-saddle' },
};

/** Collapses `manual_review`, `manual-review` and `manualReview` to one key. */
const normalise = (status) => (status || '').toString().toLowerCase().replace(/[-_\s]/g, '');

export const statusMeta = (status) =>
  STATUS[normalise(status)] || {
    label: (status || 'Unknown').toString().replace(/[-_]/g, ' '),
    Icon: FileText,
    tone: 'border-loam bg-parchment text-bark',
  };

export default function StatusBadge({ status, className = '' }) {
  const { label, Icon } = statusMeta(status);
  const { tone } = statusMeta(status);
  const spin = normalise(status) === 'processing';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-caption font-medium ${tone} ${className}`}
    >
      <Icon className={`h-3 w-3 shrink-0 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
}
