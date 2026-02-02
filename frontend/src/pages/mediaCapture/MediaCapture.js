import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import './mediacapture.css';

const MediaCapture = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [stream, setStream] = useState(null);
  const [coords, setCoords] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captureMode, setCaptureMode] = useState(null); // 'camera' | 'upload'

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const CAPTURE_STEPS = [
    { id: 'corner-ne', label: 'Northeast Corner', type: 'photo', icon: '📍', required: true, description: 'Northeast corner of your farm' },
    { id: 'corner-nw', label: 'Northwest Corner', type: 'photo', icon: '📍', required: true, description: 'Northwest corner of your farm' },
    { id: 'corner-se', label: 'Southeast Corner', type: 'photo', icon: '📍', required: true, description: 'Southeast corner of your farm' },
    { id: 'corner-sw', label: 'Southwest Corner', type: 'photo', icon: '📍', required: true, description: 'Southwest corner of your farm' },
    { id: 'damaged-crop', label: 'Damaged Crop Evidence', type: 'photo', icon: '🌾', required: true, description: 'Clear evidence of crop damage' }
  ];

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Get GPS location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
          console.log(`✅ GPS Located: ${position.coords.latitude}, ${position.coords.longitude}`);
        },
        (err) => {
          console.error('GPS Error:', err);
          // Use fallback location for demo
          setCoords({ lat: 28.6139, lon: 77.2090, accuracy: 100 });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('📷 Camera stopped - Privacy maintained');
      });
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    try {
      setError(null);
      setCaptureMode('camera');

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        console.log('✅ Camera started');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera access denied. Please use file upload instead.');
      setCaptureMode(null);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      setLoading(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Add overlay with timestamp and GPS
      const timestamp = new Date();
      const overlayText = [
        `📅 ${timestamp.toLocaleDateString('en-GB')} 🕐 ${timestamp.toLocaleTimeString()}`,
        `📍 ${coords?.lat.toFixed(6) || 'N/A'}, ${coords?.lon.toFixed(6) || 'N/A'}`,
        `${CAPTURE_STEPS[currentStep].label}`
      ];

      const fontSize = Math.max(16, canvas.width * 0.02);
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, canvas.height - 90, canvas.width - 20, 80);
      ctx.fillStyle = 'white';
      overlayText.forEach((line, i) => {
        ctx.fillText(line, 20, canvas.height - 65 + (i * 25));
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));

      setCapturedBlobs(prev => ({
        ...prev,
        [CAPTURE_STEPS[currentStep].id]: {
          blob,
          step: CAPTURE_STEPS[currentStep],
          timestamp,
          coords: coords || { lat: 0, lon: 0 }
        }
      }));

      console.log(`✅ Photo captured: ${CAPTURE_STEPS[currentStep].id}`);

      // Move to next step
      if (currentStep < CAPTURE_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
      }
    } catch (err) {
      setError('Failed to capture photo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      setCaptureMode('upload');

      // Stop camera if it was running (privacy)
      stopCamera();

      const timestamp = new Date();

      setCapturedBlobs(prev => ({
        ...prev,
        [CAPTURE_STEPS[currentStep].id]: {
          blob: file,
          step: CAPTURE_STEPS[currentStep],
          timestamp,
          coords: coords || { lat: 0, lon: 0 }
        }
      }));

      console.log(`✅ File uploaded: ${CAPTURE_STEPS[currentStep].id}`);

      // Move to next step
      if (currentStep < CAPTURE_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError('Failed to upload file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadSingleFile = async (stepId, captureData) => {
    try {
      setUploadProgress(prev => ({ ...prev, [stepId]: 'uploading' }));

      const formData = new FormData();
      const filename = `${stepId}.jpg`;
      formData.append('image', captureData.blob, filename);
      formData.append('lat', captureData.coords.lat.toString());
      formData.append('lon', captureData.coords.lon.toString());
      formData.append('client_ts', captureData.timestamp.getTime().toString());
      formData.append('parcel_id', documentId);
      formData.append('media_type', 'photo');
      formData.append('step_id', stepId);

      const response = await api.post('/api/claims/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      console.log(`✅ Uploaded: ${stepId}`);
      setUploadProgress(prev => ({ ...prev, [stepId]: 'success' }));

      return { stepId, success: response.data.success };
    } catch (err) {
      console.error(`❌ Upload failed: ${stepId}`, err);
      setUploadProgress(prev => ({ ...prev, [stepId]: 'error' }));
      throw err;
    }
  };

  const submitAllEvidence = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // STOP CAMERA - Privacy protection
      stopCamera();
      console.log('🔒 Camera stopped for privacy before upload');

      const capturedSteps = Object.keys(capturedBlobs);
      console.log(`🚀 Uploading ${capturedSteps.length} files...`);

      // Upload all files
      for (const stepId of capturedSteps) {
        await uploadSingleFile(stepId, capturedBlobs[stepId]);
      }

      // Trigger backend processing
      await api.post('/api/claims/complete', {
        documentId,
        totalSteps: CAPTURE_STEPS.length,
        completedSteps: capturedSteps.length
      });

      console.log('✅ All files uploaded and processing started');

      // Navigate to results
      setTimeout(() => {
        navigate(`/claim-results/${documentId}`);
      }, 1500);

    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStepData = CAPTURE_STEPS[currentStep];
  const capturedSteps = Object.keys(capturedBlobs);
  const allCaptured = CAPTURE_STEPS.every(step => !step.required || capturedBlobs[step.id]);

  return (
    <div className="media-capture-page">
      {/* Header */}
      <div className="capture-header">
        <div className="header-content">
          <h1>📸 Evidence Collection</h1>
          <div className="document-id">Document: {documentId}</div>
          <div className="progress-text">
            Step {currentStep + 1} of {CAPTURE_STEPS.length}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Capture Section - Only show if not all captured */}
      {!allCaptured && (
        <div className="capture-section">
          <div className="capture-card">
            {/* Step Info */}
            <div className="step-info">
              <h2>{currentStepData.icon} {currentStepData.label}</h2>
              <p>{currentStepData.description}</p>
            </div>

            {/* Mode Selection */}
            {!captureMode && (
              <div className="mode-selection">
                <h3>Choose capture method:</h3>
                <div className="mode-buttons">
                  <button onClick={startCamera} className="mode-btn camera-btn">
                    📷 Use Camera
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="mode-btn upload-btn">
                    📁 Upload File
                  </button>
                </div>
              </div>
            )}

            {/* Camera View */}
            {captureMode === 'camera' && (
              <div className="camera-section">
                <div className="camera-container">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-feed"
                  />
                  {loading && (
                    <div className="processing-overlay">
                      <div className="spinner"></div>
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
                <div className="capture-controls">
                  <button
                    onClick={capturePhoto}
                    disabled={loading || !stream}
                    className="capture-btn primary"
                  >
                    {loading ? '🔄 Processing...' : '📸 Capture Photo'}
                  </button>
                  <button
                    onClick={() => { stopCamera(); setCaptureMode(null); }}
                    className="capture-btn secondary"
                  >
                    ✕ Switch to Upload
                  </button>
                </div>
              </div>
            )}

            {/* Upload Mode */}
            {captureMode === 'upload' && (
              <div className="upload-section">
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                  <div className="upload-icon">📁</div>
                  <p>Click to select an image</p>
                  <span className="upload-hint">JPG, PNG - Max 10MB</span>
                </div>
                <button
                  onClick={() => setCaptureMode(null)}
                  className="capture-btn secondary"
                >
                  ← Switch to Camera
                </button>
              </div>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="steps-progress">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${(capturedSteps.length / CAPTURE_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="steps-grid">
          {CAPTURE_STEPS.map((step, index) => {
            const isCaptured = capturedBlobs[step.id];
            const isCurrent = index === currentStep;
            const uploadStatus = uploadProgress[step.id];
            return (
              <div
                key={step.id}
                className={`step-indicator ${isCaptured ? 'completed' : ''} ${isCurrent && !allCaptured ? 'current' : ''}`}
                onClick={() => !allCaptured && setCurrentStep(index)}
              >
                <div className="step-icon">
                  {uploadStatus === 'uploading' && '⏳'}
                  {uploadStatus === 'success' && '✅'}
                  {uploadStatus === 'error' && '❌'}
                  {!uploadStatus && (isCaptured ? '📁' : isCurrent ? step.icon : '⭕')}
                </div>
                <div className="step-label">{step.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit Section */}
      {allCaptured && (
        <div className="submit-section">
          <div className="submit-card">
            <div className="success-icon">✅</div>
            <h3>All Evidence Captured!</h3>
            <p>{capturedSteps.length} files ready to upload</p>
            <p className="privacy-note">🔒 Camera will be stopped before upload for privacy</p>

            <button
              onClick={submitAllEvidence}
              disabled={isSubmitting}
              className="submit-btn"
            >
              {isSubmitting ? '🔄 Uploading...' : '🚀 Submit All Evidence'}
            </button>

            {isSubmitting && (
              <div className="submitting-status">
                <div>📤 Uploading files...</div>
                <div>🐍 Running AI analysis...</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GPS Status */}
      <div className={`gps-status ${coords ? 'active' : 'pending'}`}>
        <span>{coords ? '📍' : '⏳'}</span>
        <div className="gps-info">
          {coords ? (
            <>
              <strong>GPS Located</strong>
              <span>{coords.lat.toFixed(6)}, {coords.lon.toFixed(6)}</span>
            </>
          ) : (
            <strong>Acquiring GPS...</strong>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default MediaCapture;
