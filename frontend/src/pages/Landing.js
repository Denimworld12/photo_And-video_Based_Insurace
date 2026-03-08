import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeSwitcher from '../components/ThemeSwitcher';
import usePWAInstall from '../hooks/usePWAInstall';
import {
  ShieldCheck, Camera, Banknote, Smartphone,
  Zap, Eye, Globe, Building2, ArrowRight, CheckCircle2,
  Sprout, Phone, Mail, ChevronRight, MapPin, Users,
  Award, TrendingUp, Leaf, Download
} from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { canInstall, promptInstall } = usePWAInstall();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate(user?.role === 'admin' ? '/admin' : '/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-base-100/95 backdrop-blur-sm border-b border-base-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
          {/* Left – Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <img src="/images/government-emblem.png" alt="Emblem" className="w-9 h-9 object-contain" />
            <div className="leading-tight">
              <span className="text-base font-bold text-base-content block">PBI AgriInsure</span>
              <span className="text-[10px] text-base-content/50 hidden sm:block">Crop Insurance Platform</span>
            </div>
          </div>

          {/* Right – Actions */}
          <div className="flex items-center gap-2">
            {canInstall && (
              <button onClick={promptInstall} className="btn btn-ghost btn-sm gap-1.5 text-primary hidden sm:flex">
                <Download className="w-4 h-4" /> Install App
              </button>
            )}
            <ThemeSwitcher compact />
            {isAuthenticated ? (
              <button onClick={handleGetStarted} className="btn btn-primary btn-sm gap-1">
                Dashboard <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="btn btn-ghost btn-sm hidden sm:flex">Login</button>
                <button onClick={() => navigate('/login')} className="btn btn-primary btn-sm">Get Started</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Install Banner — shown below navbar on small screens */}
      {canInstall && (
        <div className="fixed top-16 left-0 right-0 z-40 sm:hidden bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-primary">Install PBI AgriInsure for quick access</span>
          <button onClick={promptInstall} className="btn btn-primary btn-xs gap-1">
            <Download className="w-3 h-3" /> Install
          </button>
        </div>
      )}

      {/* ── Hero Section ── */}
      <section className="pt-20 sm:pt-24 relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/images/farmland-hero.jpeg" alt="Indian farmland" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 lg:py-40">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <img src="/images/government-emblem.png" alt="Government Emblem" className="w-8 h-8 object-contain opacity-90" />
              <span className="badge badge-primary gap-2 text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Government of India Initiative
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 text-white">
              Protect Your{' '}
              <span className="text-primary">Crops</span>{' '}
              with Smart Insurance
            </h1>
            <p className="text-lg sm:text-xl text-white/70 mb-8 max-w-xl">
              File crop damage claims instantly using your phone camera.
              AI-powered verification ensures fast, fair, and transparent payouts for Indian farmers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={handleGetStarted} className="btn btn-primary btn-lg gap-2 shadow-xl">
                <Sprout className="w-5 h-5" /> Get Started — It's Free
              </button>
              <a href="#how-it-works" className="btn btn-outline btn-lg gap-2 text-white border-white/30 hover:bg-white/10 hover:border-white/50">
                Learn How It Works
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-white/60">
              {['No Paperwork', 'AI Verified', 'Fast Payouts'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 bg-base-100 border-b border-base-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="stats stats-vertical sm:stats-horizontal shadow w-full">
            {[
              { value: '10,000+', label: 'Farmers Registered', icon: Users },
              { value: '80%', label: 'Faster Processing', icon: Zap },
              { value: '₹50Cr+', label: 'Claims Processed', icon: Banknote },
              { value: '28', label: 'States Covered', icon: Globe },
            ].map((s) => (
              <div key={s.label} className="stat">
                <div className="stat-figure text-primary"><s.icon className="w-6 h-6" /></div>
                <div className="stat-value text-primary">{s.value}</div>
                <div className="stat-desc">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Is Crop Insurance ── */}
      <section className="py-16 sm:py-24 bg-base-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-6">
                What Is <span className="text-primary">Crop Insurance</span>?
              </h2>
              <p className="text-lg text-base-content/70 leading-relaxed mb-6">
                Crop insurance protects farmers against financial loss due to natural calamities,
                pest attacks, and diseases. Under schemes like <strong>PMFBY</strong> and <strong>WBCIS</strong>,
                farmers pay a small premium and receive compensation when their crops are damaged.
              </p>
              <div className="space-y-4">
                {[
                  { icon: ShieldCheck, title: 'Premium Protection', desc: 'Low premiums backed by government subsidy for all major crops across India.' },
                  { icon: Camera, title: 'Photo Proof', desc: 'No more waiting for inspectors. Submit GPS-tagged photos from your phone.' },
                  { icon: Banknote, title: 'Direct Payouts', desc: 'Approved claims are paid directly to your bank account within days.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base-content">{item.title}</h3>
                      <p className="text-sm text-base-content/60">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <img src="/images/frontFarmer.png" alt="Indian farmer using the insurance platform" className="w-full rounded-3xl shadow-2xl object-cover max-h-[500px]" />
              <div className="absolute -bottom-4 -left-4 bg-base-100 rounded-xl shadow-lg p-4 border border-base-300">
                <p className="text-2xl font-bold text-primary">95%</p>
                <p className="text-xs text-base-content/50">Fraud Detection</p>
              </div>
              <div className="absolute -top-4 -right-4 bg-base-100 rounded-xl shadow-lg p-4 border border-base-300">
                <p className="text-2xl font-bold text-accent">24/7</p>
                <p className="text-xs text-base-content/50">Claim Filing</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-base-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-4">
              How the <span className="text-primary">Claim Process</span> Works
            </h2>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              Three simple steps to file your crop damage claim and receive your insurance payout
            </p>
          </div>
          <ul className="steps steps-vertical lg:steps-horizontal w-full mb-12">
            <li className="step step-primary">Capture Photos</li>
            <li className="step step-primary">AI Verification</li>
            <li className="step step-primary">Receive Payout</li>
          </ul>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', img: '/images/gps-capture-icon.jpg', title: 'Capture Damage Photos', desc: 'Take GPS-tagged photos of your damaged crops from different angles using your phone camera.' },
              { step: '02', img: '/images/ai-verify-icon.jpg', title: 'AI Verification', desc: 'Our AI analyzes your photos to verify damage authenticity, location, and severity — no manual inspectors needed.' },
              { step: '03', img: '/images/claim-approval-icon.jpg', title: 'Receive Payout', desc: 'Approved claims receive direct payout to your bank account. Track everything transparently in your dashboard.' },
            ].map((item) => (
              <div key={item.step} className="card bg-base-100 shadow-md border border-base-300 hover:shadow-xl transition-shadow">
                <figure className="h-40 overflow-hidden">
                  <img src={item.img} alt={item.title} className="w-full h-full object-cover" />
                </figure>
                <div className="card-body p-5">
                  <div className="badge badge-primary badge-sm mb-1">{item.step}</div>
                  <h3 className="card-title text-base">{item.title}</h3>
                  <p className="text-base-content/60 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Technology ── */}
      <section className="py-16 sm:py-24 bg-base-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <img src="/images/ai-fraud-detection-layers.png" alt="AI fraud detection layers" className="w-full rounded-2xl shadow-xl" />
            </div>
            <div className="order-1 lg:order-2">
              <span className="badge badge-secondary badge-outline gap-1 mb-4">
                <Zap className="w-3 h-3" /> AI-Powered Technology
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-6">
                Multi-Layer <span className="text-primary">Fraud Detection</span>
              </h2>
              <p className="text-base-content/60 leading-relaxed mb-6">
                Our platform uses advanced AI and machine learning to ensure only genuine claims are processed,
                protecting both farmers and insurers.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: MapPin, label: 'GPS Verification', desc: 'Location authenticity check' },
                  { icon: Camera, label: 'Image Analysis', desc: 'AI-powered damage assessment' },
                  { icon: Eye, label: 'EXIF Validation', desc: 'Metadata integrity check' },
                  { icon: ShieldCheck, label: 'Cross-Reference', desc: 'Weather & satellite data' },
                ].map((item) => (
                  <div key={item.label} className="bg-base-100 rounded-lg p-4 shadow-sm">
                    <item.icon className="w-5 h-5 text-primary mb-2" />
                    <p className="font-semibold text-sm text-base-content">{item.label}</p>
                    <p className="text-xs text-base-content/50">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Traditional vs Hybrid Model ── */}
      <section className="py-16 sm:py-24 bg-base-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-4">
              Why <span className="text-primary">PBI AgriInsure</span>?
            </h2>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              Traditional claim processing takes weeks. Our AI-powered hybrid model does it in minutes.
            </p>
          </div>
          <div className="flex justify-center">
            <img src="/images/traditional-vs-hybrid-model.png" alt="Traditional vs Hybrid Insurance Model" className="w-full max-w-4xl rounded-2xl shadow-xl border border-base-300" />
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="py-16 sm:py-24 bg-base-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-4">
              Built For <span className="text-primary">Indian Farmers</span>
            </h2>
            <p className="text-lg text-base-content/60 max-w-2xl mx-auto">
              A platform designed with simplicity, transparency, and farmer welfare in mind
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Smartphone, title: 'Mobile First', desc: 'Use your smartphone to file claims. No computers or internet cafes needed.' },
              { icon: ShieldCheck, title: 'Fraud Protection', desc: 'GPS tagging, EXIF analysis, and AI ensure only genuine claims are processed.' },
              { icon: Zap, title: 'Fast Processing', desc: 'AI-powered analysis means claims are processed in minutes, not weeks.' },
              { icon: Eye, title: 'Full Transparency', desc: 'Track every step of your claim. See AI analysis, review status, and payout details.' },
              { icon: Globe, title: 'Multi-Language Ready', desc: 'Designed for farmers across all 28 states of India with simple, clear interface.' },
              { icon: Building2, title: 'Government Aligned', desc: 'Supports PMFBY, WBCIS, and other government crop insurance schemes.' },
            ].map((item) => (
              <div key={item.title} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="card-body p-4 flex-row items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-base-content mb-0.5">{item.title}</h3>
                    <p className="text-xs text-base-content/60 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="py-16 sm:py-24 bg-base-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="badge badge-accent badge-outline gap-1 mb-4">
                <TrendingUp className="w-3 h-3" /> Smart Dashboard
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-6">
                Track Everything in <span className="text-primary">Real Time</span>
              </h2>
              <p className="text-base-content/60 leading-relaxed mb-6">
                Monitor your claims, policies, and payouts from a single intuitive dashboard. Get notified
                at every step — from submission to approval to payout.
              </p>
              <ul className="space-y-3">
                {[
                  'Real-time claim status tracking',
                  'AI confidence scores & damage reports',
                  'Download PDF analysis reports',
                  'Instant notifications on updates',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-base-content/70">
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button onClick={handleGetStarted} className="btn btn-primary mt-8 gap-2">
                <Leaf className="w-4 h-4" /> Try It Now
              </button>
            </div>
            <div className="relative">
              <img src="/images/dashboard-preview.png" alt="Dashboard preview" className="w-full rounded-2xl shadow-2xl border border-base-300" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Our Team ── */}
      <section className="py-12 sm:py-16 bg-base-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-base-content mb-3">
            Meet Our <span className="text-primary">Team</span>
          </h2>
          <p className="text-base text-base-content/60 mb-8 max-w-2xl mx-auto">
            Passionate engineers building technology for India's agricultural future
          </p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { name: 'Nikhil', role: 'Lead Developer', img: '/images/nikhil.png' },
              { name: 'Gayatri', role: 'AI & Research', img: '/images/gayatri.jpg' },
              { name: 'Umair', role: 'Backend Engineer', img: '/images/umair.jpg' },
            ].map((member) => (
              <div key={member.name} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
                <figure className="px-5 pt-5">
                  <div className="w-24 h-24 rounded-full overflow-hidden mx-auto ring-4 ring-primary/20">
                    <img src={member.img} alt={member.name} className="w-full h-full object-cover" />
                  </div>
                </figure>
                <div className="card-body items-center text-center p-4 pt-3">
                  <h3 className="card-title text-sm">{member.name}</h3>
                  <p className="text-xs text-base-content/50">{member.role}</p>
                  <div className="flex gap-1 mt-0.5">
                    <Award className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-primary font-medium">Core Team</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 sm:py-24 bg-primary text-primary-content relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Protect Your Harvest?</h2>
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            Join thousands of farmers already using PBI AgriInsure to secure their crops.
            Filing a claim takes less than 5 minutes.
          </p>
          <button onClick={handleGetStarted} className="btn btn-lg bg-base-100 text-primary hover:bg-base-200 gap-2 shadow-xl">
            Start Filing Your Claim <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-neutral text-neutral-content">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/images/government-emblem.png" alt="Emblem" className="w-10 h-10 object-contain opacity-80" />
                <div>
                  <h3 className="font-bold text-lg">PBI AgriInsure</h3>
                  <p className="text-xs opacity-60">Crop Insurance Platform</p>
                </div>
              </div>
              <p className="text-sm opacity-60 leading-relaxed">
                Photo & Video-Based Insurance Assessment Platform. Empowering Indian farmers with
                AI-powered crop damage verification.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm opacity-70">
                <li><a href="#how-it-works" className="link link-hover">How It Works</a></li>
                <li><button onClick={() => navigate('/login')} className="link link-hover">File a Claim</button></li>
                <li><button onClick={() => navigate('/login')} className="link link-hover">Track Claim</button></li>
                <li><button onClick={() => navigate('/login')} className="link link-hover">Login / Register</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-sm opacity-70">
                <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> Helpline: 1800-180-1551</li>
                <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> support@pbi-agriinsure.in</li>
                <li className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Ministry of Agriculture, New Delhi</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-sm opacity-50">
            <p>&copy; {new Date().getFullYear()} PBI AgriInsure. Ministry of Agriculture & Farmers Welfare, Government of India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
