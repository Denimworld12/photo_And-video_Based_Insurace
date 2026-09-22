import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import usePWAInstall from '../hooks/usePWAInstall';
import { APP_NAME, APP_TAGLINE, INDIAN_STATES, SUPPORT } from '../utils/constants';
import {
  ShieldCheck, Camera, Banknote, Smartphone, Zap, Eye, Globe, Building2,
  ArrowRight, CheckCircle2, Sprout, Phone, Mail, ChevronRight, MapPin,
  Award, Leaf, Download,
} from 'lucide-react';

const PROMISES = [
  { Icon: ShieldCheck, title: 'Government-backed premiums', desc: 'Low premiums subsidised under PMFBY and WBCIS for every major crop.' },
  { Icon: Camera, title: 'Photo evidence, not paperwork', desc: 'Submit GPS-tagged photos from your own phone instead of waiting for an inspector.' },
  { Icon: Banknote, title: 'Direct payouts', desc: 'Approved claims are paid straight into your bank account.' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    img: '/images/gps-capture-icon.jpg',
    title: 'Photograph the damage',
    desc: 'Take GPS-tagged photos of the four corners of your field and the damaged crop.',
  },
  {
    step: '02',
    img: '/images/ai-verify-icon.jpg',
    title: 'AI checks the evidence',
    desc: 'Photo authenticity, location, weather history and damage severity are assessed automatically.',
  },
  {
    step: '03',
    img: '/images/claim-approval-icon.jpg',
    title: 'Get your payout',
    desc: 'Approved claims are paid directly to your account, with the full assessment visible to you.',
  },
];

const FRAUD_LAYERS = [
  { Icon: MapPin, label: 'GPS verification', desc: 'Photo location matched to the insured field' },
  { Icon: Camera, label: 'Image analysis', desc: 'Damage type and severity assessed from the photo' },
  { Icon: Eye, label: 'EXIF validation', desc: 'Capture metadata checked for tampering' },
  { Icon: ShieldCheck, label: 'Cross-reference', desc: 'Weather and satellite records for the date claimed' },
];

const BENEFITS = [
  { Icon: Smartphone, title: 'Built for a phone', desc: 'The whole claim is filed one-handed from the field. No computer needed.' },
  { Icon: ShieldCheck, title: 'Fraud protection', desc: 'GPS tagging, EXIF analysis and AI keep genuine claims moving and catch the rest.' },
  { Icon: Zap, title: 'Minutes, not weeks', desc: 'Automated assessment replaces the wait for a field inspector.' },
  { Icon: Eye, title: 'Nothing hidden', desc: 'You see the AI confidence, the damage assessment and the payout calculation.' },
  { Icon: Globe, title: 'Works on a weak signal', desc: 'Installable on your phone, with pages that stay readable offline.' },
  { Icon: Building2, title: 'Aligned with the schemes', desc: 'Supports PMFBY, WBCIS and other government crop insurance schemes.' },
];

const DASHBOARD_POINTS = [
  'Live claim status at every stage',
  'AI confidence and damage figures in full',
  'Downloadable PDF assessment report',
  'Notifications when a decision is made',
];

const TEAM = [
  { name: 'Nikhil', role: 'Lead Developer', img: '/images/nikhil.png' },
  { name: 'Gayatri', role: 'AI & Research', img: '/images/gayatri.jpg' },
  { name: 'Umair', role: 'Backend Engineer', img: '/images/umair.jpg' },
];

function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { canInstall, promptInstall } = usePWAInstall();

  const handleGetStarted = () => {
    if (isAuthenticated) navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    else navigate('/login');
  };

  return (
    <div className="min-h-screen bg-parchment">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-honey-amber focus:px-4 focus:py-2 focus:text-body focus:text-ink"
      >
        Skip to content
      </a>

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-bone bg-parchment/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/images/government-emblem.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-body font-medium text-ink">{APP_NAME}</span>
              <span className="hidden text-caption text-bark sm:block">{APP_TAGLINE}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canInstall && (
              <button type="button" onClick={promptInstall} className="btn btn-ghost btn-sm hidden text-saddle sm:flex">
                <Download className="h-4 w-4" aria-hidden="true" /> Install
              </button>
            )}
            {isAuthenticated ? (
              <button type="button" onClick={handleGetStarted} className="btn btn-primary btn-sm">
                Dashboard <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="btn btn-ghost btn-sm hidden text-saddle sm:flex"
                >
                  Sign in
                </button>
                <button type="button" onClick={() => navigate('/login')} className="btn btn-primary btn-sm">
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main id="main">
        {/* Hero — the dark charcoal-olive panel rather than a black scrim over
            the photograph, so the type sits on a deliberate surface. */}
        <section className="relative overflow-hidden bg-charcoal-olive pt-16">
          <img
            src="/images/farmland-hero.jpeg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />
          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <img src="/images/government-emblem.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
                <span className="flex items-center gap-1.5 rounded-md border border-loam/40 px-2.5 py-1 text-caption uppercase tracking-[0.12em] text-loam">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Government of India initiative
                </span>
              </div>

              <h1 className="mt-6 text-heading text-parchment sm:text-heading-lg">
                Protect your crops with insurance that answers in minutes
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-loam">
                File crop damage claims from your phone camera. AI verification means fast, fair and transparent
                payouts for Indian farmers.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={handleGetStarted} className="btn btn-primary btn-lg">
                  <Sprout className="h-5 w-5" aria-hidden="true" /> Get started — it's free
                </button>
                <a href="#how-it-works" className="btn btn-lg border-loam/50 bg-transparent text-parchment hover:bg-parchment/10">
                  See how it works
                </a>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                {['No paperwork', 'AI verified', 'Fast payouts'].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-body text-loam">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-honey-amber" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* This strip previously carried invented counts — "10,000+ farmers
            registered", "₹50Cr+ claims processed" — as fact on a government
            page. It now states what the platform does, which is checkable. */}
        <section className="border-b border-bone bg-pure-white">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 divide-bone px-4 sm:grid-cols-4 sm:divide-x sm:px-6 lg:px-8">
            {[
              { value: `${INDIAN_STATES.length}`, label: 'States covered' },
              { value: '5', label: 'Photos per claim' },
              { value: '4', label: 'Fraud checks per photo' },
              { value: '24/7', label: 'Claim filing' },
            ].map((s) => (
              <div key={s.label} className="px-2 py-6 text-center sm:px-6">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-heading-sm text-ink">{s.value}</span>
                  <span className="mt-0.5 block text-body text-bark">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-parchment py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <Eyebrow>The basics</Eyebrow>
              <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">What crop insurance covers</h2>
              <p className="mt-4 text-body-lg text-saddle">
                Crop insurance protects you against loss from natural calamity, pest attack and disease. Under
                schemes such as <strong className="font-medium">PMFBY</strong> and{' '}
                <strong className="font-medium">WBCIS</strong>, you pay a small premium and receive compensation when
                your crop is damaged.
              </p>
              <ul className="mt-8 space-y-5">
                {PROMISES.map((item) => (
                  <li key={item.title} className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-honey-amber/25">
                      <item.Icon className="h-5 w-5 text-saddle" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-body-lg font-medium text-ink">{item.title}</span>
                      <span className="block text-body text-bark">{item.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <img
                src="/images/frontFarmer.png"
                alt="An Indian farmer filing a claim on the platform"
                className="w-full rounded-lg border border-bone object-cover"
              />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y border-bone bg-pure-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">Three steps to a settled claim</h2>
              <p className="mt-3 text-body-lg text-bark">
                From standing in your field to money in your account, without an inspector's visit.
              </p>
            </div>

            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <li key={item.step} className="overflow-hidden rounded-lg border border-bone bg-parchment">
                  <img src={item.img} alt="" className="h-40 w-full object-cover" />
                  <div className="p-5">
                    <p className="eyebrow">Step {item.step}</p>
                    <h3 className="mt-1 text-subheading text-ink">{item.title}</h3>
                    <p className="mt-1 text-body text-bark">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-parchment py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div className="order-2 lg:order-1">
              <img
                src="/images/ai-fraud-detection-layers.png"
                alt="Diagram of the platform's layered fraud detection"
                className="w-full rounded-lg border border-bone"
              />
            </div>
            <div className="order-1 lg:order-2">
              <Eyebrow>Verification</Eyebrow>
              <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">Four checks on every photo</h2>
              <p className="mt-4 text-body-lg text-saddle">
                Each submitted photo passes through independent checks before an assessment is produced, so genuine
                claims move quickly and the rest are caught.
              </p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {FRAUD_LAYERS.map((item) => (
                  <li key={item.label} className="rounded-lg border border-bone bg-pure-white p-4">
                    <item.Icon className="h-5 w-5 text-saddle" aria-hidden="true" />
                    <p className="mt-2 text-body font-medium text-ink">{item.label}</p>
                    <p className="text-body text-bark">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-y border-bone bg-pure-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <Eyebrow>Why it is faster</Eyebrow>
            <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">Traditional assessment versus this one</h2>
            <p className="mx-auto mt-3 max-w-2xl text-body-lg text-bark">
              Traditional claim processing waits on a field inspector. The hybrid model assesses the photographs
              first and reserves the visit for the cases that need one.
            </p>
            <img
              src="/images/traditional-vs-hybrid-model.png"
              alt="Comparison of the traditional and hybrid claim assessment models"
              className="mx-auto mt-10 w-full max-w-4xl rounded-lg border border-bone"
            />
          </div>
        </section>

        <section className="bg-parchment py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Eyebrow>Built for farmers</Eyebrow>
              <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">Designed around how you actually work</h2>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((item) => (
                <li key={item.title} className="flex items-start gap-3 rounded-lg border border-bone bg-pure-white p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-honey-amber/25">
                    <item.Icon className="h-5 w-5 text-saddle" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-lg font-medium text-ink">{item.title}</span>
                    <span className="block text-body text-bark">{item.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y border-bone bg-pure-white py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <Eyebrow>Your dashboard</Eyebrow>
              <h2 className="mt-2 text-heading-sm text-ink sm:text-heading">Follow your claim the whole way</h2>
              <p className="mt-4 text-body-lg text-saddle">
                Every claim, policy and payout in one place, with the assessment shown in full rather than summarised
                into a yes or no.
              </p>
              <ul className="mt-6 space-y-3">
                {DASHBOARD_POINTS.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-body text-saddle">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-sage" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={handleGetStarted} className="btn btn-primary mt-8">
                <Leaf className="h-4 w-4" aria-hidden="true" /> Try it now
              </button>
            </div>
            <img
              src="/images/dashboard-preview.png"
              alt="The farmer dashboard showing claims and their status"
              className="w-full rounded-lg border border-bone"
            />
          </div>
        </section>

        <section className="bg-parchment py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <Eyebrow>The team</Eyebrow>
            <h2 className="mt-2 text-heading-sm text-ink">Who built this</h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {TEAM.map((member) => (
                <li key={member.name} className="rounded-lg border border-bone bg-pure-white p-5">
                  <img
                    src={member.img}
                    alt=""
                    className="mx-auto h-24 w-24 rounded-full border border-bone object-cover"
                  />
                  <p className="mt-4 text-body-lg font-medium text-ink">{member.name}</p>
                  <p className="text-body text-bark">{member.role}</p>
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-caption text-saddle">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" /> Core team
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-charcoal-olive py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-heading-sm text-parchment sm:text-heading">Ready to protect your harvest?</h2>
            <p className="mx-auto mt-4 max-w-xl text-body-lg text-loam">
              Filing a claim takes about five minutes, and you can do it standing in your field.
            </p>
            <button type="button" onClick={handleGetStarted} className="btn btn-primary btn-lg mt-8">
              Start your claim <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-bone bg-pure-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <img src="/images/government-emblem.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <div>
                <p className="text-body-lg font-medium text-ink">{APP_NAME}</p>
                <p className="text-caption text-bark">{APP_TAGLINE}</p>
              </div>
            </div>
            <p className="mt-4 text-body text-bark">
              Photo and video based insurance assessment, giving Indian farmers AI-verified crop damage claims.
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="eyebrow">Quick links</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#how-it-works" className="text-body text-saddle underline-offset-4 hover:underline">
                  How it works
                </a>
              </li>
              {['File a claim', 'Track a claim', 'Sign in'].map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-body text-saddle underline-offset-4 hover:underline"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow">Contact</h2>
            <ul className="mt-3 space-y-2.5 text-body text-saddle">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
                <a href={`tel:${SUPPORT.helpline.replace(/\D/g, '')}`} className="underline-offset-4 hover:underline">
                  {SUPPORT.helpline}
                </a>
                <span className="text-caption text-bark">{SUPPORT.helplineNote}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
                <a href={`mailto:${SUPPORT.email}`} className="truncate underline-offset-4 hover:underline">
                  {SUPPORT.email}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
                {SUPPORT.office}
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-bone">
          <p className="mx-auto max-w-7xl px-4 py-6 text-center text-caption text-bark sm:px-6 lg:px-8">
            © {new Date().getFullYear()} {APP_NAME}. Ministry of Agriculture &amp; Farmers Welfare, Government of
            India.
          </p>
        </div>
      </footer>
    </div>
  );
}
