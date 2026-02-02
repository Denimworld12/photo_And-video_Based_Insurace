import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import './ClaimResults.css';

const ClaimResults = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log(`Fetching results for document: ${documentId}`);

      const response = await api.get(`/api/claims/results/${documentId}`);
      const data = response.data;

      if (data.success && data.processing_result) {
        setResult(data.processing_result);
        console.log('Results loaded successfully:', data.processing_result);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error loading results:', err);

      const errorMessage = err.response?.data?.message ||
        err.message ||
        'Failed to load claim results';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="results-page">
        <div className="loading-container">
          <div className="spinner-large"></div>
          <h2>Analyzing Your Claim...</h2>
          <p>Document ID: {documentId}</p>
          <p className="loading-subtext">Processing AI analysis</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="results-page">
        <div className="error-container">
          <div className="error-icon">❌</div>
          <h2>Error Loading Results</h2>
          <p className="error-message">{error || 'No results found'}</p>
          <div className="error-actions">
            <button onClick={fetchResults} className="btn-secondary">
              🔄 Try Again
            </button>
            <button onClick={() => navigate('/')} className="btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract data from new simplified backend format
  console.log('📊 FRONTEND - Received result:', result);
  console.log('📊 FRONTEND - Keys in result:', Object.keys(result));

  const confidence = result.overall_assessment?.confidence_score || 0;
  const decision = result.overall_assessment || {};
  const damageType = result.damage_type || 'Unknown';
  const damageTypeCode = result.damage_type_code || 'other';
  const damagePercent = result.damage_percentage || 0;
  const damagedAreaM2 = result.damaged_area_m2 || 0;
  const damagedAreaAcres = result.damaged_area_acres || 0;
  const payout = result.payout_calculation || {};
  const verification = result.verification_evidence || {};
  const areaInfo = result.area_info || {};
  const imagesProcessed = result.images_processed || 0;
  const imageDetails = result.image_details || [];
  const totalFieldAreaM2 = result.total_field_area_m2 || areaInfo.total_field_area_m2 || 0;
  const areaEstimationMethod = result.area_estimation_method || areaInfo.estimation_method || 'ESTIMATED';

  console.log('📊 FRONTEND - Extracted values:');
  console.log(`   - damageType: ${damageType}`);
  console.log(`   - damagePercent: ${damagePercent}`);
  console.log(`   - damagedAreaM2: ${damagedAreaM2}`);
  console.log(`   - damagedAreaAcres: ${damagedAreaAcres}`);
  console.log(`   - totalFieldAreaM2: ${totalFieldAreaM2}`);
  console.log(`   - imagesProcessed: ${imagesProcessed}`);
  console.log(`   - confidence: ${confidence}`);
  console.log(`   - decision: ${decision.final_decision}`);

  const getStatusClass = (status) => {
    const statusMap = {
      'approved': 'status-approved',
      'approve': 'status-approved',
      'manual_review': 'status-review',
      'rejected': 'status-rejected',
      'reject': 'status-rejected',
      'error': 'status-error'
    };
    return statusMap[status?.toLowerCase()] || 'status-default';
  };

  const getDecisionIcon = (decision) => {
    const icons = {
      'APPROVE': '✅',
      'MANUAL_REVIEW': '🔍',
      'REJECT': '❌',
      'ERROR': '⚠️'
    };
    return icons[decision] || '❓';
  };

  const getSeverityFromPercent = (percent) => {
    if (percent > 60) return 'critical';
    if (percent > 35) return 'severe';
    if (percent > 15) return 'moderate';
    return 'minimal';
  };

  return (
    <div className="results-page">
      <div className="results-container">

        <div className="results-header">
          <div className="header-left">
            <h1>Claim Analysis Result</h1>
            <p className="document-id">Document ID: {documentId}</p>
          </div>
          <div className="header-right">
            <button onClick={() => navigate('/')} className="btn-secondary">
              ← Back
            </button>
          </div>
        </div>

        {/* Status Card */}
        <div className={`status-card ${getStatusClass(decision.final_decision)}`}>
          <div className="status-header">
            <div className="status-icon">
              {getDecisionIcon(decision.final_decision)}
            </div>
            <div className="status-content">
              <h2>{decision.final_decision || 'PROCESSING'}</h2>
              <p className="status-message">
                {decision.final_decision === 'APPROVE'
                  ? '✅ Your claim has been approved!'
                  : decision.final_decision === 'MANUAL_REVIEW'
                    ? '🔍 Your claim requires manual review by our team'
                    : decision.final_decision === 'REJECT'
                      ? '❌ Claim rejected - please capture clearer images'
                      : 'Processing your claim...'}
              </p>
            </div>
          </div>

          <div className="confidence-bar">
            <div className="confidence-label">
              <span>AI Confidence Score</span>
              <span className="confidence-value">{(confidence * 100).toFixed(1)}%</span>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill ${confidence >= 0.7 ? 'high' : confidence >= 0.3 ? 'medium' : 'low'}`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Primary Damage Info Card */}
        <div className="damage-overview-card">
          <h3>🌾 Damage Assessment</h3>
          <div className="damage-overview-grid">
            <div className="damage-stat">
              <span className="stat-label">Damage Type</span>
              <span className="stat-value damage-type">{damageType}</span>
              <span className="stat-code">({damageTypeCode})</span>
            </div>
            <div className="damage-stat">
              <span className="stat-label">Damage Percentage</span>
              <span className="stat-value highlight">{damagePercent.toFixed(1)}%</span>
              <span className={`severity-badge ${getSeverityFromPercent(damagePercent)}`}>
                {getSeverityFromPercent(damagePercent).toUpperCase()}
              </span>
            </div>
            <div className="damage-stat">
              <span className="stat-label">Damaged Area</span>
              <span className="stat-value">{damagedAreaM2.toFixed(1)} m²</span>
              <span className="stat-sub">{damagedAreaAcres.toFixed(4)} acres</span>
            </div>
            <div className="damage-stat">
              <span className="stat-label">Images Analyzed</span>
              <span className="stat-value">{imagesProcessed}</span>
            </div>
          </div>
        </div>

        {/* Payout Card */}
        {payout && Object.keys(payout).length > 0 && (
          <div className="payout-card">
            <h3>💰 Payout Information</h3>
            <div className="payout-grid">
              <div className="payout-item">
                <span className="payout-label">Sum Insured</span>
                <span className="payout-amount">
                  ₹{(payout.sum_insured || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="payout-item">
                <span className="payout-label">Damage %</span>
                <span className="payout-amount">{payout.damage_percent || damagePercent || 0}%</span>
              </div>
              <div className="payout-item highlight">
                <span className="payout-label">Final Payout</span>
                <span className="payout-amount">
                  ₹{(payout.payout_amount || payout.final_payout_amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="payout-item">
                <span className="payout-label">Status</span>
                <span className={`payout-status ${decision.final_decision === 'APPROVE' ? 'approved' : 'pending'}`}>
                  {decision.final_decision === 'APPROVE' ? 'APPROVED' : 'PENDING'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="expandable-sections">

          {/* Area Information */}
          <div className="expandable-card">
            <div
              className="card-header"
              onClick={() => toggleSection('area')}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  toggleSection('area');
                }
              }}
            >
              <h3>📐 Area Information</h3>
              <span className="toggle-icon">{expandedSection === 'area' ? '−' : '+'}</span>
            </div>
            {expandedSection === 'area' && (
              <div className="card-content">
                <div className="area-grid">
                  <div className="area-item">
                    <span className="area-label">Total Field Area</span>
                    <span className="area-value">{totalFieldAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="area-item">
                    <span className="area-label">Damaged Area</span>
                    <span className="area-value">{damagedAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div className="area-item">
                    <span className="area-label">Damaged Area (Acres)</span>
                    <span className="area-value">{damagedAreaAcres.toFixed(4)} acres</span>
                  </div>
                  <div className="area-item">
                    <span className="area-label">Estimation Method</span>
                    <span className="area-value method-badge">
                      {areaEstimationMethod}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Image Details */}
          {imageDetails.length > 0 && (
            <div className="expandable-card">
              <div
                className="card-header"
                onClick={() => toggleSection('images')}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    toggleSection('images');
                  }
                }}
              >
                <h3>📸 Image Analysis Details</h3>
                <span className="toggle-icon">{expandedSection === 'images' ? '−' : '+'}</span>
              </div>
              {expandedSection === 'images' && (
                <div className="card-content">
                  <div className="images-list">
                    {imageDetails.map((img, idx) => (
                      <div key={idx} className="image-item">
                        <div className="image-info">
                          <span className="image-name">Image {idx + 1}</span>
                          <span className="image-type">
                            {img.damage_type_name || img.damage_type_code || 'N/A'}
                          </span>
                        </div>
                        <div className="image-stats">
                          <span className="image-damage">
                            Damage: {(img.damage_percentage || 0).toFixed(1)}%
                          </span>
                          {img.vegetation_index !== undefined && (
                            <span className="image-confidence">
                              NDVI: {img.vegetation_index.toFixed(3)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification */}
          {verification && Object.keys(verification).length > 0 && (
            <div className="expandable-card">
              <div
                className="card-header"
                onClick={() => toggleSection('verification')}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    toggleSection('verification');
                  }
                }}
              >
                <h3>✓ Verification Status</h3>
                <span className="toggle-icon">{expandedSection === 'verification' ? '−' : '+'}</span>
              </div>
              {expandedSection === 'verification' && (
                <div className="card-content">
                  <div className="verification-list">
                    <div className={`verification-item ${verification.authenticity_verified ? 'verified' : 'not-verified'}`}>
                      <span className="check-icon">{verification.authenticity_verified ? '✓' : '✗'}</span>
                      <span>Authenticity Verified</span>
                    </div>
                    <div className={`verification-item ${verification.location_verified ? 'verified' : 'not-verified'}`}>
                      <span className="check-icon">{verification.location_verified ? '✓' : '✗'}</span>
                      <span>Location Verified</span>
                    </div>
                  </div>
                  {verification.processing_note && (
                    <div className="verification-note">
                      <strong>Note:</strong> {verification.processing_note}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="action-buttons">
          <button onClick={() => navigate('/')} className="btn-primary">
            Back to Dashboard
          </button>
          <button onClick={fetchResults} className="btn-secondary">
            🔄 Refresh Results
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClaimResults;
