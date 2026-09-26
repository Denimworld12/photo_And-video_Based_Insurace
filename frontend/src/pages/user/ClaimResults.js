import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import StatTile, { Meter } from '../../components/ui/StatTile';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import {
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Eye,
  BarChart3, MapPin, Camera, Banknote, ChevronDown, FileText, Download, Sparkles,
} from 'lucide-react';

const SQ_METRES_PER_ACRE = 4046.86;

/** Defined at module scope so toggling one section does not remount them all. */
function Section({ id, title, icon: Icon, expanded, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-lg border border-bone bg-pure-white">
      <h2>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={expanded}
          aria-controls={`${id}-panel`}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-parchment"
        >
          <span className="flex items-center gap-2 text-subheading text-ink">
            <Icon className="h-4 w-4 text-bark" aria-hidden="true" /> {title}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-bark transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      {expanded && (
        <div id={`${id}-panel`} className="border-t border-bone px-5 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

const DECISION = {
  APPROVE: {
    Icon: CheckCircle2,
    title: 'Approved',
    message: 'Your claim passed assessment. The payout below is being processed.',
    panel: 'border-sage bg-sage/15 text-deep-olive',
  },
  MANUAL_REVIEW: {
    Icon: Eye,
    title: 'Under review',
    message: 'An assessor is checking your claim by hand. You will be notified when it is decided.',
    panel: 'border-honey-amber bg-honey-amber/20 text-saddle',
  },
  REJECT: {
    Icon: XCircle,
    title: 'Rejected',
    message: 'This claim was not accepted. You can resubmit with clearer evidence.',
    panel: 'border-saddle bg-saddle/10 text-saddle',
  },
};

// What an assessor's recorded decision means for the verdict panel. The claim's
// status is the decision that actually happened; the pipeline's own
// final_decision is only a recommendation, and an admin may have overruled it.
const STATUS_DECISION = {
  approved: 'APPROVE',
  payout_pending: 'APPROVE',
  payout_complete: 'APPROVE',
  rejected: 'REJECT',
  manual_review: 'MANUAL_REVIEW',
  field_verification: 'MANUAL_REVIEW',
  disputed: 'MANUAL_REVIEW',
};

const MANUAL_MESSAGE = {
  APPROVE: 'An assessor reviewed your claim and approved it.',
  REJECT: 'An assessor reviewed your claim and did not accept it. You can resubmit with clearer evidence.',
};

const PROCESSING = {
  Icon: Loader2,
  title: 'Still processing',
  message: 'The assessment is running. This page refreshes itself every few seconds.',
  panel: 'border-bone bg-parchment text-saddle',
};

export default function ClaimResults() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [claimInfo, setClaimInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [confirmResubmit, setConfirmResubmit] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchResults = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const { data } = await api.get(`/api/claims/results/${documentId}`);
        if (data.success && data.processing_result) {
          setResult(data.processing_result);
          setClaimInfo(data.claim || null);
          if (data.processing_result.aiSummary) setAiSummary(data.processing_result.aiSummary);
        } else {
          throw new Error('The assessment for this claim is not available yet.');
        }
      } catch (err) {
        if (!silent) setError(err.response?.data?.message || err.message || 'We could not load this result.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [documentId]
  );

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const claimStatus = claimInfo?.status;
  const finalDecision =
    claimStatus === 'processing'
      ? null
      : STATUS_DECISION[claimStatus] || result?.overall_assessment?.final_decision;
  const isProcessing = Boolean(result) && !DECISION[finalDecision];

  // A claim still being assessed used to sit on a frozen screen with a
  // non-spinning spinner icon, and the only way forward was a manual reload.
  useEffect(() => {
    if (!isProcessing) return undefined;
    const timer = setInterval(() => fetchResults({ silent: true }), 8000);
    return () => clearInterval(timer);
  }, [isProcessing, fetchResults]);

  const fetchAiSummary = async (refresh) => {
    try {
      setSummaryLoading(true);
      const { data } = await api.get(`/api/claims/summarize/${documentId}`, {
        params: refresh ? { refresh: 1 } : {},
      });
      if (data.success && data.aiSummary) setAiSummary(data.aiSummary);
      else toast.error('The summary could not be generated right now.');
    } catch {
      toast.error('The summary could not be generated right now.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleResubmit = async () => {
    try {
      setResubmitting(true);
      const { data } = await api.post(`/api/claims/resubmit/${documentId}`);
      const newId = data?.claim?.documentId;
      if (data.success && newId) {
        setConfirmResubmit(false);
        navigate(`/dashboard/media-capture/${newId}`);
      } else {
        // `data.claim.documentId` was read unguarded, so a differently shaped
        // response crashed the page instead of reporting a failure.
        toast.error(data?.error || 'The claim could not be reopened. Contact the helpline if this continues.');
        setConfirmResubmit(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'The claim could not be reopened. Try again in a moment.');
      setConfirmResubmit(false);
    } finally {
      setResubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading your assessment…" />;
  if (error || !result) {
    return (
      <ErrorState
        title="Result not available"
        message={error || 'No assessment has been recorded for this claim yet.'}
        onRetry={fetchResults}
      />
    );
  }

  // Null when nothing measured the claim, such as a failed pipeline run; that
  // reads as "not measured", never as a measured 0%.
  const rawConfidence = result.overall_assessment?.confidence_score;
  const confidence = Number.isFinite(rawConfidence) ? rawConfidence : null;
  const damageType = result.damage_type || 'Not classified';
  const damagePercent =
    result.damage_percentage ?? result.damage_assessment?.final_damage_percent ?? 0;
  const damagedAreaM2 = result.damaged_area_m2 || 0;
  const damagedAreaAcres = damagedAreaM2 / SQ_METRES_PER_ACRE;
  const payout = result.payout_calculation || {};
  const imagesProcessed = result.images_processed || 0;
  const totalFieldAreaM2 = result.area_info?.total_field_area_m2 || 0;
  const areaMethod = result.area_info?.estimation_method || 'Estimated';
  const pipelinePayout = payout.payout_amount || payout.final_payout_amount || 0;
  const isApproved = finalDecision === 'APPROVE';
  const manuallyReviewed = Boolean(claimInfo?.manuallyReviewed);
  // Once approved, the amount recorded on the claim is what the farmer is paid
  // (an assessor may have changed it, down to an explicit zero). Before that,
  // the pipeline's figure is only an estimate awaiting a decision.
  const payoutAmount = isApproved && claimInfo ? claimInfo.payoutAmount ?? 0 : pipelinePayout;
  const showPayout = isApproved || (finalDecision !== 'REJECT' && payoutAmount > 0);
  const reviewNotes = claimStatus !== 'rejected' ? claimInfo?.reviewNotes : null;
  const evidence = claimInfo?.uploadedImages || [];

  const baseVerdict = DECISION[finalDecision] || PROCESSING;
  const verdict = {
    ...baseVerdict,
    message:
      isApproved && payoutAmount === 0
        ? manuallyReviewed
          ? 'An assessor reviewed your claim and approved it. No payout is due on this claim.'
          : 'Your claim passed assessment. No payout is due on this claim.'
        : (manuallyReviewed && MANUAL_MESSAGE[finalDecision]) || baseVerdict.message,
  };
  const severity =
    damagePercent > 60 ? 'Critical' : damagePercent > 35 ? 'Severe' : damagePercent > 15 ? 'Moderate' : 'Minimal';

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Claim Analysis Report', 20, 20);
    doc.setFontSize(10);
    doc.text(`Document ID: ${documentId}`, 20, 30);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 20, 36);

    let y = 50;
    doc.setFontSize(14);
    doc.text('Decision', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Status: ${finalDecision || 'PROCESSING'}${manuallyReviewed ? ' (assessor decision)' : ''}`, 20, y);
    y += 6;
    doc.text(`Confidence: ${confidence != null ? `${(confidence * 100).toFixed(1)}%` : 'Not measured'}`, 20, y);
    y += 12;

    doc.setFontSize(14);
    doc.text('Damage Assessment', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Type: ${damageType}`, 20, y);
    y += 6;
    doc.text(`Percentage: ${damagePercent.toFixed(1)}%`, 20, y);
    y += 6;
    doc.text(`Damaged area: ${damagedAreaM2.toFixed(1)} m2 (${damagedAreaAcres.toFixed(2)} acres)`, 20, y);
    y += 6;
    doc.text(`Images analysed: ${imagesProcessed}`, 20, y);
    y += 12;

    if (showPayout || Object.keys(payout).length > 0) {
      doc.setFontSize(14);
      doc.text('Payout', 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`Sum insured: INR ${(payout.sum_insured || 0).toLocaleString('en-IN')}`, 20, y);
      y += 6;
      doc.text(`Final payout: INR ${payoutAmount.toLocaleString('en-IN')}`, 20, y);
    }

    doc.save(`claim-report-${documentId}.pdf`);
    toast.success('Report downloaded.');
  };

  const toggle = (id) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Assessment"
        title="Claim result"
        description={documentId}
        actions={
          <>
            <button type="button" onClick={downloadPDF} className="btn btn-outline btn-sm">
              <Download className="h-4 w-4" aria-hidden="true" /> Report
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/claims')}
              className="btn btn-ghost btn-sm text-saddle"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My claims
            </button>
          </>
        }
      />

      <div className={`flex items-start gap-4 rounded-lg border p-5 ${verdict.panel}`}>
        <verdict.Icon
          className={`mt-0.5 h-7 w-7 shrink-0 ${isProcessing ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-subheading">{verdict.title}</h2>
            {claimInfo?.status && <StatusBadge status={claimInfo.status} />}
          </div>
          <p className="mt-1 text-body">{verdict.message}</p>
        </div>
      </div>

      {reviewNotes && (
        <p className="flex items-start gap-2 rounded-md border border-bone bg-parchment px-4 py-3 text-body text-saddle">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
          <span>
            <span className="label-micro block">Assessor's note</span>
            {reviewNotes}
          </span>
        </p>
      )}

      {showPayout && (
        <section className="rounded-lg border border-sage bg-sage/10 p-5">
          <p className="eyebrow">{isApproved ? 'Payout' : 'Estimated payout'}</p>
          <p className="mt-1 text-heading text-deep-olive">₹{payoutAmount.toLocaleString('en-IN')}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-sage/40 pt-4 sm:grid-cols-3">
            {[
              // A run that did not complete has no sum insured or damage figure;
              // those rows are left out rather than shown as ₹0 and 0%.
              ...(result.pipeline_failed
                ? []
                : [
                    { label: 'Sum insured', value: `₹${(payout.sum_insured || 0).toLocaleString('en-IN')}` },
                    { label: 'Damage applied', value: `${payout.damage_percent ?? damagePercent}%` },
                  ]),
              {
                label: 'Status',
                value: !isApproved
                  ? 'Pending decision'
                  : claimStatus === 'payout_complete'
                    ? 'Paid'
                    : payoutAmount === 0
                      ? 'Approved, nothing due'
                      : manuallyReviewed
                        ? 'Approved by assessor'
                        : 'Approved',
              },
            ].map((d) => (
              <div key={d.label}>
                <dt className="label-micro text-deep-olive/70">{d.label}</dt>
                <dd className="text-body font-medium text-ink">{d.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <BarChart3 className="h-4 w-4 text-bark" aria-hidden="true" /> Damage assessment
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {confidence != null ? (
            <Meter label="AI confidence" value={confidence * 100} caption={`${(confidence * 100).toFixed(1)}%`} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="label-micro">AI confidence</span>
              <span className="text-body text-bark">Not measured</span>
            </div>
          )}
          <Meter label="Damage" value={damagePercent} caption={`${damagePercent.toFixed(1)}% · ${severity}`} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-bone pt-4 sm:grid-cols-3">
          <StatTile label="Damage type" value={damageType} />
          <StatTile label="Area damaged" value={`${damagedAreaM2.toFixed(1)} m²`} hint={`${damagedAreaAcres.toFixed(2)} acres`} />
          <StatTile label="Photos analysed" value={imagesProcessed} />
        </div>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-subheading text-ink">
            <Sparkles className="h-4 w-4 text-bark" aria-hidden="true" /> Plain-language summary
          </h2>
          <button
            type="button"
            onClick={() => fetchAiSummary(Boolean(aiSummary))}
            disabled={summaryLoading}
            className="btn btn-outline btn-sm"
          >
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {aiSummary ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {summaryLoading ? (
          <p className="mt-4 flex items-center gap-2 text-body text-bark">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Writing the summary…
          </p>
        ) : aiSummary ? (
          <div className="mt-4 space-y-4">
            <p className="text-body text-ink">{aiSummary.summary}</p>
            {aiSummary.keyFindings?.length > 0 && (
              <div>
                <p className="eyebrow">Key findings</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body text-saddle">
                  {aiSummary.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiSummary.recommendations?.length > 0 && (
              <div>
                <p className="eyebrow">What to do next</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body text-saddle">
                  {aiSummary.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiSummary.payoutJustification && (
              <p className="flex items-start gap-2 rounded-md border border-bone bg-parchment px-3 py-2.5 text-body text-saddle">
                <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
                {aiSummary.payoutJustification}
              </p>
            )}
            <p className="text-caption text-bark">
              Generated by {aiSummary.generatedBy || 'AI'}
              {aiSummary.generatedAt ? ` · ${new Date(aiSummary.generatedAt).toLocaleString('en-IN')}` : ''}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-body text-bark">
            Generate a short, plain-language explanation of this assessment and what it means for your claim.
          </p>
        )}
      </section>

      {evidence.length > 0 && (
        <section className="rounded-lg border border-bone bg-pure-white p-5">
          <h2 className="flex items-center gap-2 text-subheading text-ink">
            <Camera className="h-4 w-4 text-bark" aria-hidden="true" /> Your photos ({evidence.length})
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {evidence.map((img, i) => {
              // The farmer view read `img.url` while the admin view read
              // `img.cloudinaryUrl`, so one of the two always showed blanks.
              const src = img.url || img.cloudinaryUrl;
              return (
                <li
                  key={img._id || i}
                  className="overflow-hidden rounded-md border border-bone bg-parchment"
                >
                  <div className="aspect-video">
                    {src ? (
                      <img
                        src={src}
                        alt={`Evidence: ${img.stepId || `photo ${i + 1}`}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Camera className="h-6 w-6 text-loam" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-bone px-2 py-1.5">
                    <p className="truncate text-caption text-saddle">{img.stepId || `Photo ${i + 1}`}</p>
                    {img.coordinates?.lat != null && (
                      <p className="flex items-center gap-1 truncate text-caption text-bark">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {img.coordinates.lat.toFixed(4)}, {img.coordinates.lon.toFixed(4)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Section id="area" title="Area measurement" icon={MapPin} expanded={expanded === 'area'} onToggle={toggle}>
        <dl className="grid grid-cols-2 gap-4">
          {[
            { label: 'Total field', value: `${totalFieldAreaM2.toFixed(1)} m²` },
            { label: 'Damaged area', value: `${damagedAreaM2.toFixed(1)} m²` },
            { label: 'Damaged (acres)', value: damagedAreaAcres.toFixed(2) },
            { label: 'Method', value: areaMethod },
          ].map((d) => (
            <div key={d.label}>
              <dt className="label-micro">{d.label}</dt>
              <dd className="text-body text-ink">{d.value}</dd>
            </div>
          ))}
        </dl>
      </Section>


      {claimInfo?.status === 'rejected' && (
        <section className="rounded-lg border border-saddle bg-saddle/5 p-5">
          <h2 className="flex items-center gap-2 text-subheading text-saddle">
            <XCircle className="h-4 w-4" aria-hidden="true" /> This claim was rejected
          </h2>
          {claimInfo.rejectionReason && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-saddle bg-saddle/10 px-3 py-2.5 text-body text-saddle">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="label-micro block text-saddle">Reason given</span>
                {claimInfo.rejectionReason}
              </span>
            </p>
          )}
          <p className="mt-3 text-body text-saddle">
            You can reopen this claim and take fresh photos that address the reason above.
          </p>
          <button
            type="button"
            onClick={() => setConfirmResubmit(true)}
            disabled={resubmitting}
            className="btn btn-primary mt-4"
          >
            {resubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Resubmit with new photos
          </button>
        </section>
      )}

      {claimInfo?.resubmissionCount > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-bone bg-parchment px-4 py-3 text-body text-saddle">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
          This is resubmission #{claimInfo.resubmissionCount} of an earlier rejected claim.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => navigate('/dashboard/claims')}
          className="btn btn-outline flex-1"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All my claims
        </button>
        <button type="button" onClick={() => navigate('/dashboard')} className="btn btn-primary flex-1">
          Dashboard
        </button>
      </div>

      <ConfirmDialog
        open={confirmResubmit}
        busy={resubmitting}
        onCancel={() => setConfirmResubmit(false)}
        onConfirm={handleResubmit}
        title="Resubmit this claim?"
        description="A fresh claim is opened from this one and you go back to photo capture. Make sure your new photos answer the rejection reason."
        summary={[
          { label: 'Claim', value: documentId },
          { label: 'Reason', value: claimInfo?.rejectionReason || 'Not recorded' },
        ]}
        confirmLabel="Reopen and retake photos"
      />
    </div>
  );
}
