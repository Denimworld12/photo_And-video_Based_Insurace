import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClaim } from '../../contexts/ClaimContext';
import { INDIAN_STATES, SEASONS, CROP_TYPES, LOSS_REASONS } from '../../utils/constants';
import api from '../../utils/api';
import './claimform.css';

const ClaimForm = () => {
  const { insuranceId } = useParams();
  const navigate = useNavigate();
  const { setSelectedInsurance, updateFormData, generateDocumentId } = useClaim();

  const [insurance, setInsurance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    state: '',
    season: '',
    scheme: '',
    year: new Date().getFullYear(),
    insuranceNumber: '',
    cropType: '',
    farmArea: '',
    lossReason: '',
    lossDescription: ''
  });

  useEffect(() => {
    fetchInsuranceDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceId]);

  const fetchInsuranceDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/insurance/${insuranceId}`);

      if (response.data.insurance) {
        setInsurance(response.data.insurance);
        setSelectedInsurance(response.data.insurance);
      } else {
        throw new Error('Insurance not found');
      }
    } catch (error) {
      console.error('Failed to fetch insurance details:', error);
      alert('Failed to load insurance details. Redirecting to dashboard...');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.state) newErrors.state = 'State is required';
    if (!formData.season) newErrors.season = 'Season is required';
    if (!formData.scheme) newErrors.scheme = 'Scheme is required';
    if (!formData.insuranceNumber) newErrors.insuranceNumber = 'Insurance number is required';
    if (!formData.cropType) newErrors.cropType = 'Crop type is required';
    if (!formData.farmArea || parseFloat(formData.farmArea) <= 0) {
      newErrors.farmArea = 'Valid farm area is required';
    }
    if (!formData.lossReason) newErrors.lossReason = 'Loss reason is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setLoading(true);

      updateFormData(formData);
      const documentId = generateDocumentId();

      await api.post('/api/claims/initialize', {
        insuranceId,
        formData,
        documentId
      });

      navigate(`/media-capture/${documentId}`);

    } catch (error) {
      console.error('Failed to initialize claim:', error);

      const errorMessage = error.response?.data?.message ||
        'Failed to process your claim. Please try again.';
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !insurance) {
    return (
      <div className="claim-form-loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading insurance details...</p>
        </div>
      </div>
    );
  }

  const availableSchemes = insurance?.schemes?.filter(scheme =>
    !formData.season || scheme.seasons?.includes(formData.season)
  ) || [];

  return (
    <div className="claim-form-page">
      <div className="gov-header">
        <div className="gov-emblem">
          <img
            src="/images/government-emblem.png"
            alt="Government Emblem"
            loading="lazy"
          />
        </div>
        <div className="gov-title">
          <h1>Government of India</h1>
          <h2>Ministry of Agriculture & Farmers Welfare</h2>
          <h3>Crop Insurance Claim Application</h3>
        </div>
      </div>

      <div className="claim-form-container">
        <div className="form-card">
          <div className="form-header">
            <h2 className="form-title">Claim Application Form</h2>
            <p className="form-subtitle">
              Please fill all mandatory fields marked with <span className="required-indicator">*</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="claim-form">
            <div className="form-section">
              <div className="section-header">
                <span className="section-number">01</span>
                <h3 className="section-title">Location & Policy Details</h3>
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="state" className="field-label">
                    State <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.state ? 'field-error' : ''}`}>
                    <select
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="field-input"
                      required
                    >
                      <option value="">— Select State —</option>
                      {INDIAN_STATES.map(state => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  {errors.state && <span className="error-message">{errors.state}</span>}
                </div>

                <div className="form-field">
                  <label htmlFor="season" className="field-label">
                    Season <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.season ? 'field-error' : ''}`}>
                    <select
                      id="season"
                      name="season"
                      value={formData.season}
                      onChange={handleInputChange}
                      className="field-input"
                      required
                    >
                      <option value="">— Select Season —</option>
                      {SEASONS.map(season => (
                        <option key={season} value={season}>{season}</option>
                      ))}
                    </select>
                  </div>
                  {errors.season && <span className="error-message">{errors.season}</span>}
                </div>

                <div className="form-field">
                  <label htmlFor="scheme" className="field-label">
                    Insurance Scheme <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.scheme ? 'field-error' : ''}`}>
                    <select
                      id="scheme"
                      name="scheme"
                      value={formData.scheme}
                      onChange={handleInputChange}
                      className="field-input"
                      required
                      disabled={!formData.season}
                    >
                      <option value="">— Select Scheme —</option>
                      {availableSchemes.map(scheme => (
                        <option key={scheme.code} value={scheme.code}>
                          {scheme.name} ({scheme.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.scheme && <span className="error-message">{errors.scheme}</span>}
                  {!formData.season && (
                    <span className="field-hint">Please select a season first</span>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="year" className="field-label">
                    Policy Year <span className="required">*</span>
                  </label>
                  <div className="field-wrapper">
                    <input
                      type="number"
                      id="year"
                      name="year"
                      value={formData.year}
                      onChange={handleInputChange}
                      className="field-input"
                      min="2020"
                      max={new Date().getFullYear() + 1}
                      required
                    />
                  </div>
                </div>

                <div className="form-field form-field-full">
                  <label htmlFor="insuranceNumber" className="field-label">
                    Insurance Policy Number <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.insuranceNumber ? 'field-error' : ''}`}>
                    <input
                      type="text"
                      id="insuranceNumber"
                      name="insuranceNumber"
                      value={formData.insuranceNumber}
                      onChange={handleInputChange}
                      className="field-input"
                      placeholder="Enter your insurance policy number"
                      required
                    />
                  </div>
                  {errors.insuranceNumber && <span className="error-message">{errors.insuranceNumber}</span>}
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <span className="section-number">02</span>
                <h3 className="section-title">Crop Information</h3>
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="cropType" className="field-label">
                    Crop Type <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.cropType ? 'field-error' : ''}`}>
                    <select
                      id="cropType"
                      name="cropType"
                      value={formData.cropType}
                      onChange={handleInputChange}
                      className="field-input"
                      required
                    >
                      <option value="">— Select Crop Type —</option>
                      {CROP_TYPES.map(crop => (
                        <option key={crop} value={crop}>{crop}</option>
                      ))}
                    </select>
                  </div>
                  {errors.cropType && <span className="error-message">{errors.cropType}</span>}
                </div>

                <div className="form-field">
                  <label htmlFor="farmArea" className="field-label">
                    Farm Area (acres) <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.farmArea ? 'field-error' : ''}`}>
                    <input
                      type="number"
                      id="farmArea"
                      name="farmArea"
                      value={formData.farmArea}
                      onChange={handleInputChange}
                      className="field-input"
                      placeholder="0.0"
                      min="0.1"
                      step="0.1"
                      required
                    />
                  </div>
                  {errors.farmArea && <span className="error-message">{errors.farmArea}</span>}
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <span className="section-number">03</span>
                <h3 className="section-title">Loss Details</h3>
              </div>

              <div className="form-grid">
                <div className="form-field form-field-full">
                  <label htmlFor="lossReason" className="field-label">
                    Primary Cause of Loss <span className="required">*</span>
                  </label>
                  <div className={`field-wrapper ${errors.lossReason ? 'field-error' : ''}`}>
                    <select
                      id="lossReason"
                      name="lossReason"
                      value={formData.lossReason}
                      onChange={handleInputChange}
                      className="field-input"
                      required
                    >
                      <option value="">— Select Loss Reason —</option>
                      {LOSS_REASONS.map(reason => (
                        <option key={reason} value={reason}>
                          {reason.charAt(0).toUpperCase() + reason.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.lossReason && <span className="error-message">{errors.lossReason}</span>}
                </div>

                <div className="form-field form-field-full">
                  <label htmlFor="lossDescription" className="field-label">
                    Detailed Loss Description
                  </label>
                  <div className="field-wrapper">
                    <textarea
                      id="lossDescription"
                      name="lossDescription"
                      value={formData.lossDescription}
                      onChange={handleInputChange}
                      className="field-input field-textarea"
                      placeholder="Provide detailed description of crop loss, estimated damage percentage, affected area, and any other relevant information..."
                      rows="5"
                    />
                  </div>
                  <span className="field-hint">
                    Include timelines, weather conditions, and any supporting details
                  </span>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-secondary"
                disabled={loading}
              >
                <span className="btn-icon">←</span>
                Back to Dashboard
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="btn-spinner"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    Proceed to Media Capture
                    <span className="btn-icon">→</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="form-footer">
            <p className="footer-text">
              All information provided will be verified with official records.
              False claims may result in legal action.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaimForm;
