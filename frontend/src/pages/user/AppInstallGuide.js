import React from 'react';
import usePWAInstall from '../../hooks/usePWAInstall';
import {
  Download, Smartphone, WifiOff, RefreshCw, Zap,
  Globe, Shield, CheckCircle2, Monitor, ArrowRight, Info,
  Server, HardDrive, Bell
} from 'lucide-react';

export default function AppInstallGuide() {
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-base-content flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" /> Install PBI AgriInsure App
        </h1>
        <p className="text-sm text-base-content/60 mt-1">
          Install this web app on your device for a faster, native-like experience
        </p>
      </div>

      {/* Install CTA */}
      <div className="card bg-gradient-to-r from-primary to-primary/80 text-primary-content shadow-lg">
        <div className="card-body p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <img src="/images/government-emblem.png" alt="Logo" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <h2 className="font-bold text-lg">PBI AgriInsure</h2>
                <p className="text-sm opacity-80">Crop Insurance Platform</p>
              </div>
            </div>
            {isInstalled ? (
              <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium text-sm">Already Installed</span>
              </div>
            ) : canInstall ? (
              <button onClick={promptInstall} className="btn bg-white text-primary hover:bg-white/90 gap-2 shadow-lg">
                <Download className="w-5 h-5" /> Install Now
              </button>
            ) : (
              <div className="text-sm opacity-80 max-w-[200px]">
                <Info className="w-4 h-4 inline mr-1" />
                Open in Chrome or Edge to install
              </div>
            )}
          </div>
        </div>
      </div>

      {/* How to Install */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-5">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-primary" /> How to Install
          </h3>
          <div className="space-y-4">
            {[
              {
                step: 1,
                title: 'Open in a supported browser',
                desc: 'Use Chrome, Edge, or Samsung Internet on your device. Safari on iOS supports Add to Home Screen.',
                icon: Globe,
              },
              {
                step: 2,
                title: 'Look for the install prompt',
                desc: 'A banner or "Install App" button will appear. On iOS Safari, tap the Share button then "Add to Home Screen".',
                icon: Download,
              },
              {
                step: 3,
                title: 'Confirm installation',
                desc: 'Tap "Install" or "Add" to place the app on your home screen. It works just like a native app!',
                icon: CheckCircle2,
              },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <h4 className="font-medium text-sm text-base-content">{item.title}</h4>
                  <p className="text-xs text-base-content/60 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-5">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-primary" /> Benefits of Installing
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                icon: Zap,
                title: 'Faster Loading',
                desc: 'App assets are cached locally — pages load instantly without waiting for network.',
                color: 'text-warning',
              },
              {
                icon: WifiOff,
                title: 'Offline Support',
                desc: 'Browse cached pages even without internet. Perfect for rural areas with spotty connectivity.',
                color: 'text-info',
              },
              {
                icon: Monitor,
                title: 'Native Experience',
                desc: 'Runs in its own window without browser UI. Feels like a real app on your phone or desktop.',
                color: 'text-success',
              },
              {
                icon: Bell,
                title: 'Quick Access',
                desc: 'Launch directly from your home screen or app drawer — no need to type a URL.',
                color: 'text-secondary',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 p-3 bg-base-200/50 rounded-lg">
                <item.icon className={`w-5 h-5 ${item.color} shrink-0 mt-0.5`} />
                <div>
                  <h4 className="font-medium text-sm text-base-content">{item.title}</h4>
                  <p className="text-xs text-base-content/60 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How Updates Work */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-5">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-primary" /> How Updates Work
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Server className="w-4 h-4 text-base-content/50 shrink-0 mt-0.5" />
              <div>
                <p className="text-base-content">
                  <strong>Automatic updates:</strong> When we deploy a new version, the installed app detects
                  the change on your next visit and silently downloads the update. The updated version
                  takes effect on the following app launch.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <HardDrive className="w-4 h-4 text-base-content/50 shrink-0 mt-0.5" />
              <div>
                <p className="text-base-content">
                  <strong>No action needed:</strong> You don't need to manually update or reinstall the app.
                  The service worker handles cache invalidation automatically.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-base-content/50 shrink-0 mt-0.5" />
              <div>
                <p className="text-base-content">
                  <strong>API & Config:</strong> The backend API URL and configuration settings are embedded
                  at build time. After deployment updates, they are refreshed automatically. Your login and
                  data remain intact across updates.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body p-5">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-primary" /> Technical Details
          </h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Technology', value: 'Progressive Web App (PWA)' },
              { label: 'Caching Strategy', value: 'Stale-While-Revalidate for assets, Network-only for API' },
              { label: 'Supported Browsers', value: 'Chrome, Edge, Firefox, Samsung Internet, Safari (limited)' },
              { label: 'Supported Platforms', value: 'Android, iOS, Windows, macOS, Linux' },
              { label: 'Offline Capability', value: 'Static pages & assets available offline' },
              { label: 'Auto-Update', value: 'Yes — new versions applied on next launch' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-base-200 last:border-0">
                <span className="text-base-content/60">{item.label}</span>
                <span className="font-medium text-base-content text-right max-w-[60%]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Browser Compatibility Note */}
      <div className="alert alert-info shadow-sm">
        <Info className="w-5 h-5 shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">Safari / iOS Note</h4>
          <p className="text-xs mt-0.5">
            Safari does not support the standard PWA install prompt. On iPhone and iPad, use the
            Share button <ArrowRight className="w-3 h-3 inline rotate-[-90deg]" /> then tap
            "Add to Home Screen" to install the app.
          </p>
        </div>
      </div>
    </div>
  );
}
