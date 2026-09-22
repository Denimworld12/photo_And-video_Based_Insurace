import React from 'react';
import usePWAInstall from '../../hooks/usePWAInstall';
import PageHeader from '../../components/ui/PageHeader';
import { APP_NAME, APP_TAGLINE } from '../../utils/constants';
import {
  Download, Smartphone, WifiOff, RefreshCw, Zap, Globe, CheckCircle2,
  Monitor, Info, Share,
} from 'lucide-react';

const STEPS = [
  {
    title: 'Open in a supported browser',
    desc: 'Chrome, Edge or Samsung Internet on Android. On an iPhone or iPad, use Safari.',
    Icon: Globe,
  },
  {
    title: 'Start the install',
    desc: 'Tap "Install app" when it appears. In Safari, tap the Share button, then "Add to Home Screen".',
    Icon: Share,
  },
  {
    title: 'Confirm',
    desc: 'Tap Install or Add. The app lands on your home screen and opens in its own window.',
    Icon: CheckCircle2,
  },
];

const BENEFITS = [
  { Icon: Zap, title: 'Opens faster', desc: 'Pages are stored on your phone, so they appear without waiting for the network.' },
  { Icon: WifiOff, title: 'Works on a weak signal', desc: 'Pages you have already visited stay readable when the connection drops in the field.' },
  { Icon: Monitor, title: 'Its own window', desc: 'No browser bars — the camera and claim forms get the full screen.' },
  { Icon: Smartphone, title: 'One tap away', desc: 'Launch from your home screen instead of typing a web address.' },
];

const FACTS = [
  { label: 'Technology', value: 'Progressive Web App' },
  { label: 'Caching', value: 'Assets cached on device, claim data always fetched live' },
  { label: 'Platforms', value: 'Android, iOS, Windows, macOS, Linux' },
  { label: 'Offline', value: 'Pages and assets you have already opened' },
  { label: 'Updates', value: 'Downloaded in the background, applied on next launch' },
];

export default function AppInstallGuide() {
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Mobile"
        title="Install the app"
        description="Put PBI AgriInsure on your home screen so it opens quickly, even where the signal is poor."
      />

      <section className="rounded-lg border border-charcoal-olive bg-charcoal-olive p-5 text-parchment">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-parchment/10">
              <img src="/images/government-emblem.png" alt="" className="h-8 w-8 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-body-lg font-medium">{APP_NAME}</p>
              <p className="text-body text-loam">{APP_TAGLINE}</p>
            </div>
          </div>

          {isInstalled ? (
            <p className="flex items-center gap-2 rounded-md border border-sage px-4 py-2 text-body text-parchment">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-sage" aria-hidden="true" /> Already installed
            </p>
          ) : canInstall ? (
            <button type="button" onClick={promptInstall} className="btn btn-primary">
              <Download className="h-5 w-5" aria-hidden="true" /> Install now
            </button>
          ) : (
            <p className="flex max-w-xs items-start gap-2 text-body text-loam">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Your browser has not offered an install prompt. Follow the steps below.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <Smartphone className="h-4 w-4 text-bark" aria-hidden="true" /> How to install
        </h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((item, i) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-honey-amber/25 text-body font-medium text-saddle">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-body font-medium text-ink">{item.title}</span>
                <span className="block text-body text-bark">{item.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <Zap className="h-4 w-4 text-bark" aria-hidden="true" /> Why install
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <li key={item.title} className="flex items-start gap-3 rounded-md border border-bone bg-parchment p-3">
              <item.Icon className="mt-0.5 h-5 w-5 shrink-0 text-bark" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-body font-medium text-ink">{item.title}</span>
                <span className="block text-body text-bark">{item.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <RefreshCw className="h-4 w-4 text-bark" aria-hidden="true" /> Updates and details
        </h2>
        <p className="mt-3 text-body text-bark">
          You never need to reinstall. When a new version is published, the installed app downloads it in the
          background and switches over the next time you open it. Your sign-in and your claims are unaffected.
        </p>
        <dl className="mt-4 divide-y divide-bone border-t border-bone">
          {FACTS.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="label-micro">{row.label}</dt>
              <dd className="max-w-[60%] text-right text-body text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="flex items-start gap-3 rounded-md border border-bone bg-parchment px-4 py-3 text-body text-saddle">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
        <span>
          <span className="block font-medium text-ink">On iPhone and iPad</span>
          Safari does not show an install button. Tap the Share icon in the toolbar, then choose “Add to Home
          Screen”.
        </span>
      </p>
    </div>
  );
}
