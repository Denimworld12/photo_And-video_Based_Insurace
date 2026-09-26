import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Meter } from '../../components/ui/StatTile';
import { themeColor, themeColorAlpha } from '../../utils/theme';
import {
  Camera, Upload, MapPin, MapPinOff, CheckCircle2, XCircle, Loader2,
  ArrowLeft, RefreshCw, Send, AlertTriangle, X, Image as ImageIcon,
} from 'lucide-react';

const CAPTURE_STEPS = [
  { id: 'corner-ne', label: 'Northeast corner', description: 'Stand at the northeast corner, facing into the field.' },
  { id: 'corner-nw', label: 'Northwest corner', description: 'Stand at the northwest corner, facing into the field.' },
  { id: 'corner-se', label: 'Southeast corner', description: 'Stand at the southeast corner, facing into the field.' },
  { id: 'corner-sw', label: 'Southwest corner', description: 'Stand at the southwest corner, facing into the field.' },
  { id: 'damaged-crop', label: 'Damaged crop', description: 'Close enough to see the damage clearly on the plants.' },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export default function MediaCapture() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [stream, setStream] = useState(null);
  const [coords, setCoords] = useState(null);
  const [geoState, setGeoState] = useState('pending'); // pending | ok | denied | unsupported
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoState('ok');
      },
      // This used to silently substitute the coordinates of New Delhi when
      // location was refused, so a claim from anywhere in India was stamped
      // and uploaded as if it were filed in Delhi — with nothing on screen to
      // say so. It now reports honestly and asks the farmer to fix it.
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const retryLocation = () => {
    if (!navigator.geolocation) return;
    setGeoState('pending');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoState('ok');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startCamera = async () => {
    try {
      setError(null);
      setCaptureMode('camera');
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = ms;
      setStream(ms);
      if (videoRef.current) videoRef.current.srcObject = ms;
    } catch {
      setError('We could not open the camera. Allow camera access in your browser settings, or choose a photo from your gallery instead.');
      setCaptureMode(null);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      setBusy(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const stamped = new Date();
      const fontSize = Math.max(16, canvas.width * 0.02);
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = themeColorAlpha('ink', 0.72);
      ctx.fillRect(10, canvas.height - 90, canvas.width - 20, 80);
      ctx.fillStyle = themeColor('parchment');
      [
        `${stamped.toLocaleDateString('en-GB')} ${stamped.toLocaleTimeString()}`,
        coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}` : 'Location unavailable',
        CAPTURE_STEPS[currentStep].label,
      ].forEach((line, i) => ctx.fillText(line, 20, canvas.height - 65 + i * 25));

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      recordCapture(blob, stamped);
    } catch (e) {
      setError(`We could not save that photo: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const recordCapture = (blob, timestamp) => {
    const stepItem = CAPTURE_STEPS[currentStep];
    setCapturedBlobs((prev) => ({
      ...prev,
      [stepItem.id]: { blob, step: stepItem, timestamp, coords },
    }));
    setUploadProgress((prev) => ({ ...prev, [stepItem.id]: undefined }));
    const nextMissing = CAPTURE_STEPS.findIndex((s, i) => i > currentStep && !capturedBlobs[s.id]);
    if (nextMissing !== -1) setCurrentStep(nextMissing);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    const reset = () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('That file is not a photo. Choose a JPG or PNG image.');
      reset();
      return;
    }
    if (file.size === 0) {
      setError('That file is empty. Choose another photo.');
      reset();
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That photo is larger than 10 MB. Choose a smaller one, or take a new photo with the camera.');
      reset();
      return;
    }

    setError(null);
    stopCamera();
    setCaptureMode('upload');
    recordCapture(file, new Date());
    reset();
  };

  const submitAllEvidence = async () => {
    const entries = Object.entries(capturedBlobs);
    if (entries.length === 0) {
      setError('Take at least one photo before submitting.');
      setConfirmOpen(false);
      return;
    }

    const invalid = entries.find(([, cd]) => !cd.blob || cd.blob.size === 0);
    if (invalid) {
      setError(`The photo for “${invalid[1].step?.label || invalid[0]}” did not save properly. Take it again.`);
      setConfirmOpen(false);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      stopCamera();

      // Only send what has not already landed, so retrying after a dropped
      // connection resumes instead of re-uploading every photo.
      const pending = entries.filter(([stepId]) => uploadProgress[stepId] !== 'success');

      for (const [stepId, cd] of pending) {
        setUploadProgress((prev) => ({ ...prev, [stepId]: 'uploading' }));
        const fd = new FormData();
        fd.append('image', cd.blob, `${stepId}.jpg`);
        // Without a fix, the coordinates are left out rather than sent as
        // 0/0. The backend stores that as "no location" and skips the
        // location and weather checks, instead of filing the photo under a
        // GPS tag the farmer never gave.
        if (cd.coords?.lat != null && cd.coords?.lon != null) {
          fd.append('lat', cd.coords.lat.toString());
          fd.append('lon', cd.coords.lon.toString());
        }
        fd.append('client_ts', (cd.timestamp?.getTime() || Date.now()).toString());
        fd.append('parcel_id', documentId);
        fd.append('media_type', 'photo');
        fd.append('step_id', stepId);

        try {
          await api.post('/api/claims/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          setUploadProgress((prev) => ({ ...prev, [stepId]: 'success' }));
        } catch (uploadErr) {
          setUploadProgress((prev) => ({ ...prev, [stepId]: 'error' }));
          throw uploadErr;
        }
      }

      await api.post('/api/claims/complete', {
        documentId,
        totalSteps: CAPTURE_STEPS.length,
        completedSteps: entries.length,
      });
      setConfirmOpen(false);
      navigate(`/dashboard/claim-results/${documentId}`);
    } catch (err) {
      setConfirmOpen(false);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'The upload stopped partway. Your finished photos are kept — press submit again to send the rest.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const capturedCount = Object.keys(capturedBlobs).length;
  const allCaptured = CAPTURE_STEPS.every((s) => capturedBlobs[s.id]);
  const missingCoords = Object.values(capturedBlobs).filter((cd) => cd.coords?.lat == null).length;
  const canSubmit = capturedCount > 0;
  const activeStep = CAPTURE_STEPS[currentStep];

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      <PageHeader
        eyebrow="Evidence"
        title="Photograph the damage"
        description={`Five photos: the four corners of your field, and the damaged crop.`}
        actions={<span className="font-mono text-caption text-bark">{documentId}</span>}
      />

      <div className="rounded-lg border border-bone bg-pure-white p-5">
        <Meter
          label="Photos taken"
          value={capturedCount}
          max={CAPTURE_STEPS.length}
          caption={`${capturedCount} of ${CAPTURE_STEPS.length}`}
        />

        <div className="mt-4 border-t border-bone pt-4">
          {geoState === 'ok' && coords && (
            <p className="flex items-center gap-2 text-caption text-bark">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-sage" aria-hidden="true" />
              Location locked: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} (±{coords.accuracy?.toFixed(0)}m)
            </p>
          )}
          {geoState === 'pending' && (
            <p className="flex items-center gap-2 text-caption text-bark">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> Finding your location…
            </p>
          )}
          {(geoState === 'denied' || geoState === 'unsupported') && (
            <div className="flex flex-wrap items-start gap-3 rounded-md border border-honey-amber bg-honey-amber/20 px-3 py-2.5">
              <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-saddle" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-body text-saddle">
                <span className="font-medium">Your location is not available.</span> You can still submit, but
                photos without a location cannot be checked against your field or local weather, so the claim is
                likely to need a manual review. Allow location access before taking the photos if you can.
              </p>
              {geoState === 'denied' && (
                <button type="button" onClick={retryLocation} className="btn btn-outline btn-sm">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-saddle bg-saddle/10 px-4 py-3 text-body text-saddle"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="btn btn-ghost btn-xs btn-circle shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {!allCaptured && (
        <section className="rounded-lg border border-bone bg-pure-white p-5">
          <p className="eyebrow">
            Photo {currentStep + 1} of {CAPTURE_STEPS.length}
          </p>
          <h2 className="mt-1 text-subheading text-ink">{activeStep.label}</h2>
          <p className="mt-1 text-body text-bark">{activeStep.description}</p>

          {!captureMode && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={startCamera} className="btn btn-primary h-auto flex-col gap-1 py-5">
                <Camera className="h-7 w-7" aria-hidden="true" />
                <span className="text-body font-medium">Take a photo</span>
                <span className="text-caption font-normal opacity-70">Stamped with time and GPS</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline h-auto flex-col gap-1 py-5"
              >
                <ImageIcon className="h-7 w-7" aria-hidden="true" />
                <span className="text-body font-medium">Choose from gallery</span>
                <span className="text-caption font-normal opacity-70">Slower to verify</span>
              </button>
            </div>
          )}

          {captureMode === 'camera' && (
            <div className="mt-5 space-y-3">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-charcoal-olive">
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
                    <Loader2 className="h-8 w-8 animate-spin text-parchment" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={busy || !stream}
                  className="btn btn-primary flex-1"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Capture'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setCaptureMode(null);
                  }}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {captureMode === 'upload' && (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-loam bg-parchment p-8 transition-colors hover:border-honey-amber"
              >
                <Upload className="h-8 w-8 text-bark" aria-hidden="true" />
                <span className="text-body text-saddle">Choose a photo for “{activeStep.label}”</span>
                <span className="text-caption text-bark">JPG or PNG, up to 10 MB</span>
              </button>
              <button type="button" onClick={() => setCaptureMode(null)} className="btn btn-ghost w-full text-saddle">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to camera
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </section>
      )}

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <h2 className="eyebrow">Your photos</h2>
        {/* A five-column grid put ~55px cells with two-word labels on a 360px
            phone. A list gives each photo a full-width, tappable row. */}
        <ul className="mt-3 divide-y divide-bone">
          {CAPTURE_STEPS.map((stepItem, i) => {
            const captured = capturedBlobs[stepItem.id];
            const status = uploadProgress[stepItem.id];
            const isCurrent = i === currentStep && !allCaptured;

            return (
              <li key={stepItem.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(i);
                    setCaptureMode(null);
                  }}
                  disabled={isSubmitting}
                  className={`flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-parchment ${
                    isCurrent ? 'bg-honey-amber/10' : ''
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {status === 'uploading' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-saddle" aria-hidden="true" />
                    ) : status === 'error' ? (
                      <XCircle className="h-5 w-5 text-saddle" aria-hidden="true" />
                    ) : captured ? (
                      <CheckCircle2 className="h-5 w-5 text-sage" aria-hidden="true" />
                    ) : (
                      <Camera className="h-5 w-5 text-loam" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-ink">{stepItem.label}</span>
                    <span className="block text-caption text-bark">
                      {status === 'uploading'
                        ? 'Uploading…'
                        : status === 'success'
                          ? 'Uploaded'
                          : status === 'error'
                            ? 'Upload failed — press submit to retry'
                            : captured
                              ? `Taken ${captured.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                              : 'Not taken yet'}
                    </span>
                  </span>
                  {!captured && (
                    <span className="shrink-0 text-caption font-medium text-saddle">
                      {isCurrent ? 'Take now' : 'Take'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {capturedCount > 0 && (
        <div className="sticky bottom-20 z-10 rounded-lg border border-bone bg-pure-white p-4 lg:bottom-4">
          {!allCaptured && (
            <p className="mb-3 text-body text-bark">
              {CAPTURE_STEPS.length - capturedCount} photo
              {CAPTURE_STEPS.length - capturedCount === 1 ? '' : 's'} still to take. A complete set is assessed
              faster and needs fewer field visits.
            </p>
          )}
          {missingCoords > 0 && (
            <p className="mb-3 flex items-start gap-2 text-body text-saddle">
              <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {missingCoords} photo{missingCoords === 1 ? ' was' : 's were'} taken without a location fix. You can
              submit anyway, or turn location on and retake {missingCoords === 1 ? 'it' : 'them'} for a faster
              assessment.
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isSubmitting || !canSubmit}
            className="btn btn-primary w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Uploading…
              </>
            ) : (
              <>
                <Send className="h-5 w-5" aria-hidden="true" /> Submit {capturedCount} photo
                {capturedCount === 1 ? '' : 's'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Uploading ends the farmer's part of the claim and starts the AI
          assessment, so it asks first — and says plainly when the set is short. */}
      <ConfirmDialog
        open={confirmOpen}
        busy={isSubmitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submitAllEvidence}
        title={allCaptured ? 'Submit your photos?' : 'Submit an incomplete set?'}
        description={
          allCaptured
            ? 'Your photos go to the assessor and the AI analysis starts. You will see the result on the next screen.'
            : 'You have not taken every photo. Incomplete claims are usually sent for a manual field visit, which takes longer to settle.'
        }
        summary={[
          { label: 'Photos', value: `${capturedCount} of ${CAPTURE_STEPS.length}` },
          {
            label: 'Location',
            value:
              missingCoords === 0
                ? 'GPS attached to every photo'
                : `${missingCoords} of ${capturedCount} photo${capturedCount === 1 ? '' : 's'} without a location`,
          },
          { label: 'Claim', value: documentId },
        ]}
        confirmLabel={allCaptured ? 'Submit photos' : 'Submit anyway'}
      />
    </div>
  );
}
