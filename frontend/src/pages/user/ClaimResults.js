import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
  ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Eye, BarChart3, MapPin, Camera, Banknote,
  ChevronDown, ChevronUp, FileText, Download, Sparkles
} from 'lucide-react';
import jsPDF from 'jspdf';

export default function ClaimResults() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [claimInfo, setClaimInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => { fetchResults(); }, [documentId]); // eslint-disable-line

  const fetchResults = async () => {
    try {
      setLoading(true); setError(null);
      const { data } = await api.get(`/api/claims/results/${documentId}`);
      if (data.success && data.processing_result) {
        setResult(data.processing_result);
        setClaimInfo(data.claim || null);
        // Check for embedded AI summary
        if (data.processing_result.aiSummary) {
          setAiSummary(data.processing_result.aiSummary);
        }
      } else throw new Error('Invalid response');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load results');
    } finally { setLoading(false); }
  };

  const fetchAiSummary = async (refresh = false) => {
    try {
      setSummaryLoading(true);
      const { data } = await api.get(`/api/claims/summarize/${documentId}`, { params: refresh ? { refresh: 1 } : {} });
      if (data.success && data.aiSummary) setAiSummary(data.aiSummary);
    } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  };

  const handleResubmit = async () => {
    try {
      setResubmitting(true);
      const { data } = await api.post(`/api/claims/resubmit/${documentId}`);
      if (data.success) navigate(`/dashboard/media-capture/${data.claim.documentId}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to resubmit claim');
    } finally { setResubmitting(false); }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Claim Analysis Report', 20, 20);
    doc.setFontSize(10);
    doc.text(`Document ID: ${documentId}`, 20, 30);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 20, 36);

    let y = 50;
    doc.setFontSize(14);
    doc.text('Decision', 20, y); y += 8;
    doc.setFontSize(10);
    doc.text(`Status: ${decision.final_decision || 'PROCESSING'}`, 20, y); y += 6;
    doc.text(`Confidence: ${(confidence * 100).toFixed(1)}%`, 20, y); y += 12;

    doc.setFontSize(14);
    doc.text('Damage Assessment', 20, y); y += 8;
    doc.setFontSize(10);
    doc.text(`Type: ${damageType}`, 20, y); y += 6;
    doc.text(`Percentage: ${damagePercent.toFixed(1)}%`, 20, y); y += 6;
    doc.text(`Damaged Area: ${damagedAreaM2.toFixed(1)} m² (${damagedAreaAcres.toFixed(4)} acres)`, 20, y); y += 6;
    doc.text(`Images Analyzed: ${imagesProcessed}`, 20, y); y += 12;

    if (payout && Object.keys(payout).length > 0) {
      doc.setFontSize(14);
      doc.text('Payout Information', 20, y); y += 8;
      doc.setFontSize(10);
      doc.text(`Sum Insured: INR ${(payout.sum_insured || 0).toLocaleString('en-IN')}`, 20, y); y += 6;
      doc.text(`Final Payout: INR ${(payout.payout_amount || payout.final_payout_amount || 0).toLocaleString('en-IN')}`, 20, y); y += 6;
    }

    doc.save(`claim-report-${documentId}.pdf`);
  };

  const toggle = (s) => setExpandedSection(expandedSection === s ? null : s);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="loading loading-spinner loading-lg text-primary" />
      <h2 className="text-lg font-semibold text-base-content mt-4">Analyzing Your Claim...</h2>
      <p className="text-sm text-base-content/40 mt-1 font-mono">{documentId}</p>
    </div>
  );

  if (error || !result) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <XCircle className="w-12 h-12 text-error mb-3" />
      <h2 className="text-lg font-semibold text-base-content">Error Loading Results</h2>
      <p className="text-sm text-error mt-1">{error || 'No results found'}</p>
      <div className="flex gap-3 mt-6">
        <button onClick={fetchResults} className="btn btn-ghost gap-2"><RefreshCw className="w-4 h-4" /> Retry</button>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary">Dashboard</button>
      </div>
    </div>
  );

  const confidence = result.overall_assessment?.confidence_score || 0;
  const decision = result.overall_assessment || {};
  const damageType = result.damage_type || 'Unknown';
  const damagePercent = result.damage_percentage || 0;
  const damagedAreaM2 = result.damaged_area_m2 || 0;
  const damagedAreaAcres = result.damaged_area_acres || 0;
  const payout = result.payout_calculation || {};
  const imagesProcessed = result.images_processed || 0;
  const totalFieldAreaM2 = result.total_field_area_m2 || result.area_info?.total_field_area_m2 || 0;
  const areaMethod = result.area_estimation_method || result.area_info?.estimation_method || 'ESTIMATED';
  const imageDetails = result.image_details || [];

  const decisionStyle = {
    APPROVE: { alert: 'alert-success', Icon: CheckCircle2, bar: 'progress-success', msg: 'Your claim has been approved!' },
    MANUAL_REVIEW: { alert: 'alert-warning', Icon: Eye, bar: 'progress-warning', msg: 'Your claim requires manual review.' },
    REJECT: { alert: 'alert-error', Icon: XCircle, bar: 'progress-error', msg: 'Claim rejected — please recapture evidence.' },
  }[decision.final_decision] || { alert: 'alert-info', Icon: Loader2, bar: 'progress-info', msg: 'Processing...' };

  const severity = (p) => p > 60 ? 'Critical' : p > 35 ? 'Severe' : p > 15 ? 'Moderate' : 'Minimal';
  const sevBadge = (p) => p > 60 ? 'badge-error' : p > 35 ? 'badge-warning' : p > 15 ? 'badge-info' : 'badge-success';

  const Section = ({ id, title, icon: SIcon, children }) => (
    <div className="card bg-base-100 shadow-sm border border-base-200">
      <div className="card-body p-4">
        <button onClick={() => toggle(id)} className="w-full flex items-center justify-between">
          <h3 className="font-semibold text-base-content flex items-center gap-2">
            <SIcon className="w-4 h-4 text-primary" /> {title}
          </h3>
          {expandedSection === id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedSection === id && <div className="mt-4 pt-4 border-t border-base-200">{children}</div>}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Claim Analysis Result</h1>
          <p className="text-xs text-base-content/40 font-mono mt-0.5">{documentId}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPDF} className="btn btn-ghost btn-sm gap-1">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => navigate('/dashboard/claims')} className="btn btn-ghost btn-sm gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Decision Card */}
      <div className={`alert ${decisionStyle.alert} shadow-md`}>
        <decisionStyle.Icon className="w-8 h-8" />
        <div>
          <h2 className="text-lg font-bold">{decision.final_decision || 'PROCESSING'}</h2>
          <p className="text-sm opacity-80">{decisionStyle.msg}</p>
        </div>
      </div>

      {/* Confidence */}
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-base-content/60">AI Confidence Score</span>
            <span className="font-bold text-base-content">{(confidence * 100).toFixed(1)}%</span>
          </div>
          <progress className={`progress w-full ${decisionStyle.bar}`} value={confidence * 100} max="100" />
        </div>
      </div>

      {/* AI Summary */}
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-base-content flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-secondary" /> AI Summary
            </h3>
            <button onClick={() => fetchAiSummary(!aiSummary)} disabled={summaryLoading} className="btn btn-ghost btn-xs gap-1">
              {summaryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {aiSummary ? 'Refresh' : 'Generate'}
            </button>
          </div>
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-sm text-base-content/50">
              <Loader2 className="w-4 h-4 animate-spin" /> Generating AI summary…
            </div>
          ) : aiSummary ? (
            <div className="space-y-3">
              <p className="text-sm text-base-content/80">{aiSummary.summary}</p>
              {aiSummary.keyFindings?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-base-content/50 uppercase mb-1">Key Findings</p>
                  <ul className="list-disc list-inside text-xs text-base-content/60 space-y-0.5">
                    {aiSummary.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              {aiSummary.recommendations?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-base-content/50 uppercase mb-1">Recommendations</p>
                  <ul className="list-disc list-inside text-xs text-base-content/60 space-y-0.5">
                    {aiSummary.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {aiSummary.payoutJustification && (
                <div className="alert alert-info text-xs py-2">
                  <Banknote className="w-3 h-3" /> {aiSummary.payoutJustification}
                </div>
              )}
              <p className="text-[10px] text-base-content/30">
                Generated by {aiSummary.generatedBy || 'AI'} · {aiSummary.generatedAt ? new Date(aiSummary.generatedAt).toLocaleString('en-IN') : ''}
              </p>
            </div>
          ) : (
            <p className="text-xs text-base-content/40">Click "Generate" to create an AI-powered summary of this claim assessment.</p>
          )}
        </div>
      </div>

      {/* Damage Overview */}
      <div className="card bg-base-100 shadow-sm border border-base-200">
        <div className="card-body p-4">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" /> Damage Assessment
          </h3>
          <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-200/50">
            <div className="stat py-3 px-4">
              <div className="stat-title text-xs">Damage Type</div>
              <div className="stat-value text-sm">{damageType}</div>
            </div>
            <div className="stat py-3 px-4">
              <div className="stat-title text-xs">Damage</div>
              <div className="stat-value text-2xl">{damagePercent.toFixed(1)}%</div>
              <div className="stat-desc"><span className={`badge badge-sm ${sevBadge(damagePercent)}`}>{severity(damagePercent)}</span></div>
            </div>
            <div className="stat py-3 px-4">
              <div className="stat-title text-xs">Area Damaged</div>
              <div className="stat-value text-sm">{damagedAreaM2.toFixed(1)} m²</div>
              <div className="stat-desc">{damagedAreaAcres.toFixed(4)} acres</div>
            </div>
            <div className="stat py-3 px-4">
              <div className="stat-title text-xs">Images</div>
              <div className="stat-value text-lg">{imagesProcessed}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Payout */}
      {payout && Object.keys(payout).length > 0 && (
        <div className="card bg-success/5 border-2 border-success/30 shadow-sm">
          <div className="card-body p-4">
            <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
              <Banknote className="w-4 h-4 text-success" /> Payout Information
            </h3>
            <div className="stats stats-vertical sm:stats-horizontal w-full bg-success/10">
              <div className="stat py-3 px-4">
                <div className="stat-title text-xs">Sum Insured</div>
                <div className="stat-value text-sm">₹{(payout.sum_insured || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="stat py-3 px-4">
                <div className="stat-title text-xs">Damage Applied</div>
                <div className="stat-value text-sm">{payout.damage_percent || damagePercent}%</div>
              </div>
              <div className="stat py-3 px-4">
                <div className="stat-title text-xs">Final Payout</div>
                <div className="stat-value text-xl text-success">₹{(payout.payout_amount || payout.final_payout_amount || 0).toLocaleString('en-IN')}</div>
              </div>
              <div className="stat py-3 px-4">
                <div className="stat-title text-xs">Status</div>
                <div className="stat-desc mt-1">
                  <span className={`badge ${decision.final_decision === 'APPROVE' ? 'badge-success' : 'badge-warning'}`}>
                    {decision.final_decision === 'APPROVE' ? 'APPROVED' : 'PENDING'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Area Info */}
      <Section id="area" title="Area Information" icon={MapPin}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-base-content/40 text-xs">Total Field</p><p className="font-medium">{totalFieldAreaM2.toFixed(1)} m²</p></div>
          <div><p className="text-base-content/40 text-xs">Damaged Area</p><p className="font-medium">{damagedAreaM2.toFixed(1)} m²</p></div>
          <div><p className="text-base-content/40 text-xs">Damaged (acres)</p><p className="font-medium">{damagedAreaAcres.toFixed(4)}</p></div>
          <div><p className="text-base-content/40 text-xs">Method</p><span className="badge badge-info badge-sm">{areaMethod}</span></div>
        </div>
      </Section>

      {/* Uploaded Evidence Photos */}
      {claimInfo?.uploadedImages?.length > 0 && (
        <div className="card bg-base-100 shadow-sm border border-base-200">
          <div className="card-body p-4">
            <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
              <Camera className="w-4 h-4 text-primary" /> Evidence Photos ({claimInfo.uploadedImages.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {claimInfo.uploadedImages.map((img, i) => (
                <div key={i} className="relative aspect-video bg-base-200 rounded-xl overflow-hidden border border-base-300">
                  {img.url ? (
                    <img src={img.url} alt={img.stepId || `Evidence ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base-content/30 text-sm">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-white text-xs font-medium">{img.stepId || `Step ${i + 1}`}</p>
                    {img.coordinates?.lat && (
                      <p className="text-white/70 text-[10px] flex items-center gap-0.5">
                        <MapPin className="w-2 h-2" />{img.coordinates.lat.toFixed(4)}, {img.coordinates.lon.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Image Analysis Details */}
      {imageDetails.length > 0 && (
        <Section id="images" title={`Image Analysis (${imageDetails.length})`} icon={Camera}>
          <div className="space-y-3">
            {imageDetails.map((img, i) => (
              <div key={i} className="p-3 bg-base-200 rounded-lg text-sm">
                <p className="font-medium text-base-content">{img.step_id || `Image ${i + 1}`}</p>
                {img.coordinates && (
                  <p className="text-xs text-base-content/40 flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {img.coordinates.lat?.toFixed(6)}, {img.coordinates.lon?.toFixed(6)}
                  </p>
                )}
                {img.damage_detected != null && (
                  <p className="text-xs mt-1">Damage: {img.damage_detected ? 'Yes' : 'No'}{img.damage_level ? ` (${img.damage_level})` : ''}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Rejection + Resubmit */}
      {claimInfo?.status === 'rejected' && (
        <div className="card bg-error/5 border-2 border-error/30">
          <div className="card-body p-4">
            <h3 className="font-semibold text-error flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Claim Rejected
            </h3>
            {claimInfo.rejectionReason && (
              <div className="alert alert-error mt-3">
                <AlertTriangle className="w-4 h-4" />
                <div>
                  <p className="text-xs font-medium">Reason</p>
                  <p className="text-sm">{claimInfo.rejectionReason}</p>
                </div>
              </div>
            )}
            <p className="text-sm text-base-content/60 mt-2">You can resubmit this claim with updated evidence photos.</p>
            <button onClick={handleResubmit} disabled={resubmitting} className="btn btn-error btn-sm mt-3 gap-2">
              {resubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Resubmitting...</> : <><RefreshCw className="w-4 h-4" /> Resubmit with New Evidence</>}
            </button>
          </div>
        </div>
      )}

      {/* Resubmission Info */}
      {claimInfo?.resubmissionCount > 0 && (
        <div className="alert alert-warning">
          <FileText className="w-4 h-4" />
          <span><strong>Resubmission #{claimInfo.resubmissionCount}</strong> — This claim was resubmitted from a previously rejected claim.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => navigate('/dashboard/claims')} className="btn btn-ghost flex-1">
          <ArrowLeft className="w-4 h-4" /> My Claims
        </button>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary flex-1">Dashboard</button>
      </div>
    </div>
  );
}
