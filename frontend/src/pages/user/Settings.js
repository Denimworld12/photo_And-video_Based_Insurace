import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import usePWAInstall from '../../hooks/usePWAInstall';
import { getConfig } from '../../utils/config';
import { APP_NAME, APP_TAGLINE, SUPPORT } from '../../utils/constants';
import { useAuth } from '../../contexts/AuthContext';
import {
  Info, ShieldCheck, Phone, Mail, Download, CheckCircle2, User, ArrowRight, Building2,
} from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();
  const config = getConfig();

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Your account, the app, and how to get help." />

      <section className="rounded-lg border border-bone bg-pure-white">
        <h2 className="border-b border-bone px-5 py-4 text-subheading text-ink">Account</h2>
        <button
          type="button"
          onClick={() => navigate('/dashboard/profile')}
          className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-parchment"
        >
          <User className="h-5 w-5 shrink-0 text-bark" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium text-ink">{user?.fullName || 'Your profile'}</span>
            <span className="block text-body text-bark">+91 {user?.phoneNumber || 'Not on file'}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
        </button>
      </section>

      {/* The theme picker that used to live here offered five stock daisyUI
          palettes, including a Halloween one. The app now ships a single
          designed theme, so this space holds something a farmer can act on. */}
      <section className="rounded-lg border border-bone bg-pure-white">
        <h2 className="border-b border-bone px-5 py-4 text-subheading text-ink">App on your phone</h2>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <Download className="h-5 w-5 shrink-0 text-bark" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">
              {isInstalled ? 'Installed on this device' : 'Install for offline access'}
            </p>
            <p className="text-body text-bark">
              {isInstalled
                ? 'You can open PBI AgriInsure from your home screen.'
                : 'Adds an icon to your home screen and keeps pages available with a weak signal.'}
            </p>
          </div>
          {isInstalled ? (
            <span className="flex items-center gap-1.5 text-body text-deep-olive">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Installed
            </span>
          ) : canInstall ? (
            <button type="button" onClick={promptInstall} className="btn btn-primary btn-sm">
              Install
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/dashboard/install-app')}
              className="btn btn-outline btn-sm"
            >
              How to install
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white">
        <h2 className="border-b border-bone px-5 py-4 text-subheading text-ink">Get help</h2>
        <ul className="divide-y divide-bone">
          <li>
            <a
              href={`tel:${SUPPORT.helpline.replace(/\D/g, '')}`}
              className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-parchment"
            >
              <Phone className="h-5 w-5 shrink-0 text-bark" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-ink">Call the helpline</span>
                <span className="block text-body text-bark">
                  {SUPPORT.helpline} · {SUPPORT.helplineNote}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href={`mailto:${SUPPORT.email}`}
              className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-parchment"
            >
              <Mail className="h-5 w-5 shrink-0 text-bark" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-ink">Email support</span>
                <span className="block truncate text-body text-bark">{SUPPORT.email}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white">
        <h2 className="flex items-center gap-2 border-b border-bone px-5 py-4 text-subheading text-ink">
          <Info className="h-4 w-4 text-bark" aria-hidden="true" /> About
        </h2>

        <div className="flex items-center gap-4 border-b border-bone px-5 py-4">
          <img src="/images/government-emblem.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">{APP_NAME}</p>
            <p className="text-body text-bark">{APP_TAGLINE}</p>
          </div>
        </div>

        <dl className="divide-y divide-bone px-5">
          {[
            // Read from the app config rather than a literal pasted into this
            // page, which had drifted to a version the build no longer matched.
            { label: 'Version', value: config.APP_VERSION, Icon: ShieldCheck },
            { label: 'Assessment', value: 'Photo analysis with Google Gemini', Icon: Info },
            { label: 'Issued by', value: SUPPORT.office, Icon: Building2 },
          ].map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-2 py-3.5">
              <dt className="flex items-center gap-2 text-body text-bark">
                <row.Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {row.label}
              </dt>
              <dd className="text-right text-body text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
