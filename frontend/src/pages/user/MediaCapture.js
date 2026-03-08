import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { Camera, Upload, MapPin, CheckCircle2, XCircle, Loader2, ArrowLeft, RefreshCw, Send } from 'lucide-react';

const CAPTURE_STEPS = [
  { id: 'corner-ne', label: 'Northeast Corner', description: 'Northeast corner of your farm' },
  { id: 'corner-nw', label: 'Northwest Corner', description: 'Northwest corner of your farm' },
  { id: 'corner-se', label: 'Southeast Corner', description: 'Southeast corner of your farm' },
  { id: 'corner-sw', label: 'Southwest Corner', description: 'Southwest corner of your farm' },
  { id: 'damaged-crop', label: 'Damaged Crop Evidence', description: 'Clear evidence of crop damage' },
];

export default function MediaCapture() {
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
  const [captureMode, setCaptureMode] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { return () => stopCamera(); }, []); // eslint-disable-line

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => setCoords({ lat: 28.6139, lon: 77.2090, accuracy: 100 }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const stopCamera = () => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    try {
      setError(null);
      setCaptureMode('camera');
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      if (videoRef.current) { videoRef.current.srcObject = ms; setStream(ms); }
    } catch {
      setError('Camera access denied. Use file upload instead.');
      setCaptureMode(null);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      setLoading(true);
      const v = videoRef.current, c = canvasRef.current;
      c.width = v.videoWidth || 1920;
      c.height = v.videoHeight || 1080;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const ts = new Date();
      const fs = Math.max(16, c.width * 0.02);
      ctx.font = `bold ${fs}px Arial`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, c.height - 90, c.width - 20, 80);
      ctx.fillStyle = 'white';
      [`${ts.toLocaleDateString('en-GB')} ${ts.toLocaleTimeString()}`,
        `${coords?.lat.toFixed(6)}, ${coords?.lon.toFixed(6)}`,
        CAPTURE_STEPS[currentStep].label,
      ].forEach((l, i) => ctx.fillText(l, 20, c.height - 65 + i * 25));
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      setCapturedBlobs(p => ({ ...p, [CAPTURE_STEPS[currentStep].id]: { blob, step: CAPTURE_STEPS[currentStep], timestamp: ts, coords: coords || { lat: 0, lon: 0 } } }));
      if (currentStep < CAPTURE_STEPS.length - 1) setCurrentStep(p => p + 1);
    } catch (e) { setError('Capture failed: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate image type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.some(t => file.type === t)) {
      setError('Invalid file type. Only JPG and PNG images are accepted.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file isn't empty
    if (file.size === 0) {
      setError('File is empty. Please select a valid image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    stopCamera();
    setCaptureMode('upload');
    setCapturedBlobs(p => ({ ...p, [CAPTURE_STEPS[currentStep].id]: { blob: file, step: CAPTURE_STEPS[currentStep], timestamp: new Date(), coords: coords || { lat: 0, lon: 0 } } }));
    if (currentStep < CAPTURE_STEPS.length - 1) setCurrentStep(p => p + 1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitAllEvidence = async () => {
    // Validate all images before submission
    const blobEntries = Object.entries(capturedBlobs);
    if (blobEntries.length === 0) {
      setError('No images captured. Please capture or upload at least one image.');
      return;
    }

    for (const [stepId, cd] of blobEntries) {
      if (!cd.blob || (cd.blob.size !== undefined && cd.blob.size === 0)) {
        setError(`Invalid image for step "${cd.step?.label || stepId}". Please recapture.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);
      stopCamera();
      console.log(`[MediaCapture] Starting upload of ${blobEntries.length} images for ${documentId}`);

      for (const [stepId, cd] of blobEntries) {
        setUploadProgress(p => ({ ...p, [stepId]: 'uploading' }));
        const fd = new FormData();
        fd.append('image', cd.blob, `${stepId}.jpg`);
        fd.append('lat', (cd.coords?.lat || 0).toString());
        fd.append('lon', (cd.coords?.lon || 0).toString());
        fd.append('client_ts', (cd.timestamp?.getTime() || Date.now()).toString());
        fd.append('parcel_id', documentId);
        fd.append('media_type', 'photo');
        fd.append('step_id', stepId);

        try {
          await api.post('/api/claims/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          setUploadProgress(p => ({ ...p, [stepId]: 'success' }));
          console.log(`[MediaCapture] ✅ Uploaded ${stepId}`);
        } catch (uploadErr) {
          console.error(`[MediaCapture] ❌ Upload failed for ${stepId}:`, uploadErr.response?.data || uploadErr.message);
          setUploadProgress(p => ({ ...p, [stepId]: 'error' }));
          throw uploadErr;
        }
      }

      console.log(`[MediaCapture] All uploads complete, completing claim...`);
      await api.post('/api/claims/complete', { documentId, totalSteps: CAPTURE_STEPS.length, completedSteps: blobEntries.length });
      console.log(`[MediaCapture] ✅ Claim completed: ${documentId}`);
      setTimeout(() => navigate(`/dashboard/claim-results/${documentId}`), 1500);
    } catch (err) {
      const failedSteps = Object.keys(uploadProgress).filter(k => uploadProgress[k] !== 'success');
      failedSteps.forEach(k => setUploadProgress(p => ({ ...p, [k]: 'error' })));
      const errMsg = err.response?.data?.message || err.response?.data?.error || 'Upload failed. Please try again.';
      console.error('[MediaCapture] ❌ Error:', errMsg);
      setError(errMsg);
    } finally { setIsSubmitting(false); }
  };

  const allCaptured = CAPTURE_STEPS.every(s => capturedBlobs[s.id]);
  const capturedCount = Object.keys(capturedBlobs).length;
  const progress = (capturedCount / CAPTURE_STEPS.length) * 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" /> Evidence Collection
            </h1>
            <span className="text-xs text-base-content/40 font-mono">{documentId}</span>
          </div>
          <p className="text-sm text-base-content/60 mb-3">Step {currentStep + 1} of {CAPTURE_STEPS.length}</p>
          <progress className="progress progress-primary w-full" value={progress} max="100" />
          {coords && (
            <p className="text-xs text-base-content/40 flex items-center gap-1 mt-2">
              <MapPin className="w-3 h-3" /> {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} (±{coords.accuracy?.toFixed(0)}m)
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <XCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="btn btn-ghost btn-xs">✕</button>
        </div>
      )}

      {/* Capture Area */}
      {!allCaptured && (
        <div className="card bg-base-100 shadow-md">
          <div className="card-body">
            <h2 className="card-title text-base">
              <MapPin className="w-4 h-4 text-primary" /> {CAPTURE_STEPS[currentStep].label}
            </h2>
            <p className="text-sm text-base-content/60">{CAPTURE_STEPS[currentStep].description}</p>

            {!captureMode && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={startCamera} className="btn btn-primary flex-col h-auto py-6 gap-2">
                  <Camera className="w-8 h-8" />
                  <span className="text-sm font-medium">Capture Photo</span>
                  <span className="text-[10px] opacity-60">Use device camera</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-outline flex-col h-auto py-6 gap-2">
                  <Upload className="w-8 h-8" />
                  <span className="text-sm">Upload Photo</span>
                  <span className="text-[10px] opacity-60">For testing only</span>
                </button>
              </div>
            )}

            {captureMode === 'camera' && (
              <div className="space-y-3 mt-2">
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {loading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={capturePhoto} disabled={loading || !stream} className="btn btn-primary flex-1 gap-2">
                    <Camera className="w-4 h-4" /> {loading ? 'Processing...' : 'Capture Photo'}
                  </button>
                  <button onClick={() => { stopCamera(); setCaptureMode(null); }} className="btn btn-ghost">
                    <RefreshCw className="w-4 h-4" /> Switch
                  </button>
                </div>
              </div>
            )}

            {captureMode === 'upload' && (
              <div className="space-y-3 mt-2">
                <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-base-300 rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <Upload className="w-10 h-10 text-base-content/40" />
                  <p className="text-sm text-base-content/60">Click to select an image</p>
                  <span className="text-xs text-base-content/30">JPG, PNG only — Max 10MB</span>
                </div>
                <button onClick={() => setCaptureMode(null)} className="btn btn-ghost w-full gap-2">
                  <ArrowLeft className="w-4 h-4" /> Switch to Camera
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleFileUpload} className="hidden" />
          </div>
        </div>
      )}

      {/* Steps Grid */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h3 className="font-medium text-base-content mb-3">Captured Evidence</h3>
          <div className="grid grid-cols-5 gap-2">
            {CAPTURE_STEPS.map((stepItem, i) => {
              const captured = capturedBlobs[stepItem.id];
              const status = uploadProgress[stepItem.id];
              const isCurrent = i === currentStep && !allCaptured;
              return (
                <button
                  key={stepItem.id}
                  onClick={() => !allCaptured && setCurrentStep(i)}
                  className={`p-3 rounded-xl text-center transition-all border-2 ${
                    captured ? 'bg-success/10 border-success' :
                    isCurrent ? 'bg-primary/10 border-primary' :
                    'bg-base-200 border-transparent'
                  }`}
                >
                  <span className="text-lg block">
                    {status === 'uploading' ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /> :
                     status === 'success' ? <CheckCircle2 className="w-5 h-5 mx-auto text-success" /> :
                     status === 'error' ? <XCircle className="w-5 h-5 mx-auto text-error" /> :
                     captured ? <CheckCircle2 className="w-5 h-5 mx-auto text-success" /> :
                     <Camera className="w-5 h-5 mx-auto text-base-content/30" />}
                  </span>
                  <span className="text-[10px] text-base-content/50 block mt-1 leading-tight">{stepItem.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Submit */}
      {allCaptured && (
        <div className="card bg-success/10 border-2 border-success shadow-md">
          <div className="card-body text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-2" />
            <h3 className="font-semibold text-base-content text-lg">All Evidence Captured!</h3>
            <p className="text-sm text-base-content/60 mb-4">{capturedCount} images ready for upload and analysis</p>
            <button onClick={submitAllEvidence} disabled={isSubmitting} className="btn btn-primary btn-lg gap-2">
              {isSubmitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Uploading & Processing...</>
              ) : (
                <><Send className="w-5 h-5" /> Submit All Evidence</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
