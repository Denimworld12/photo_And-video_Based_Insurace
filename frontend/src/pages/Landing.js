import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeSwitcher from '../components/ThemeSwitcher';
import {
  ShieldCheck, Camera, ClipboardCheck, Banknote, Smartphone,
  Zap, Eye, Globe, Building2, ArrowRight, CheckCircle2,
  Sprout, Phone, Mail, ChevronRight
} from 'lucide-react';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

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
      <nav className="navbar bg-base-100/95 backdrop-blur-sm border-b border-base-300 fixed top-0 z-50 px-4 sm:px-8">
        <div className="flex-1 gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <span className="text-lg font-bold text-base-content">PBI AgriInsure</span>
            <p className="text-xs text-base-content/50 -mt-0.5">Crop Insurance Platform</p>
          </div>
        </div>
        <div className="flex-none gap-2">
          <ThemeSwitcher compact />
          {isAuthenticated ? (
            <button onClick={handleGetStarted} className="btn btn-primary btn-sm">
              Dashboard <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button onClick={() => navigate('/login')} className="btn btn-ghost btn-sm hidden sm:flex">Login</button>
              <button onClick={() => navigate('/login')} className="btn btn-primary btn-sm">Get Started</button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="pt-24 pb-16 sm:pt-32 sm:pb-24 bg-base-200 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="badge badge-primary badge-outline gap-2 mb-6">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Government of India Initiative
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                <span className="text-base-content">Protect Your </span>
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Crops</span>
                <span className="text-base-content"> with Smart Insurance</span>
              </h1>
              <p className="text-lg sm:text-xl text-base-content/60 mb-8 max-w-xl mx-auto lg:mx-0">
                File crop damage claims instantly using your phone camera.
                AI-powered verification ensures fast, fair, and transparent payouts for Indian farmers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button onClick={handleGetStarted} className="btn btn-primary btn-lg gap-2">
                  <Sprout className="w-5 h-5" /> Get Started — It's Free
                </button>
                <a href="#how-it-works" className="btn btn-outline btn-lg gap-2">
                  Learn How It Works
                </a>
              </div>
              <div className="mt-8 flex items-center gap-6 justify-center lg:justify-start text-sm text-base-content/50">
                {['No Paperwork', 'AI Verified', 'Fast Payouts'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" /> {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative">
                <div className="w-full h-96 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl flex items-center justify-center border border-base-300">
                  <div className="text-center">
                    <Camera className="w-20 h-20 text-primary mx-auto mb-4" strokeWidth={1.5} />
                    <p className="text-base-content font-semibold text-lg">Photo-Based Verification</p>
                    <p className="text-base-content/60 text-sm mt-1">Snap → Submit → Get Paid</p>
                  </div>
                </div>
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
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 bg-base-100 border-y border-base-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="stats stats-vertical sm:stats-horizontal shadow w-full">
            {[
              { value: '10,000+', label: 'Farmers Registered' },
              { value: '80%', label: 'Faster Processing' },
              { value: '₹50Cr+', label: 'Claims Processed' },
              { value: '28', label: 'States Covered' },
            ].map((s) => (
              <div key={s.label} className="stat">
                <div className="stat-value text-primary">{s.value}</div>
                <div className="stat-desc">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Is Crop Insurance ── */}
      <section className="py-16 sm:py-24 bg-base-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-base-content mb-6">
            What Is <span className="text-primary">Crop Insurance</span>?
          </h2>
          <p className="text-lg text-base-content/70 leading-relaxed mb-8">
            Crop insurance protects farmers against financial loss due to natural calamities,
            pest attacks, and diseases. Under schemes like <strong>PMFBY</strong> and <strong>WBCIS</strong>,
            farmers pay a small premium and receive compensation when their crops are damaged.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 text-left">
            {[
              { icon: <ShieldCheck className="w-6 h-6" />, title: 'Premium Protection', desc: 'Low premiums backed by government subsidy for all major crops across India.' },
              { icon: <Camera className="w-6 h-6" />, title: 'Photo Proof', desc: 'No more waiting for inspectors. Submit GPS-tagged photos from your phone.' },
              { icon: <Banknote className="w-6 h-6" />, title: 'Direct Payouts', desc: 'Approved claims are paid directly to your bank account within days.' },
            ].map((item) => (
              <div key={item.title} className="card bg-base-100 shadow-sm">
                <div className="card-body items-center text-center">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">{item.icon}</div>
                  <h3 className="card-title text-base">{item.title}</h3>
                  <p className="text-sm text-base-content/60">{item.desc}</p>
                </div>
              </div>
            ))}
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
              { step: '01', icon: <Camera className="w-8 h-8" />, title: 'Capture Damage Photos', desc: 'Take GPS-tagged photos of your damaged crops from different angles using your phone camera.' },
              { step: '02', icon: <ClipboardCheck className="w-8 h-8" />, title: 'AI Verification', desc: 'Our AI analyzes your photos to verify damage authenticity, location, and severity — no manual inspectors needed.' },
              { step: '03', icon: <Banknote className="w-8 h-8" />, title: 'Receive Payout', desc: 'Approved claims receive direct payout to your bank account. Track everything transparently in your dashboard.' },
            ].map((item) => (
              <div key={item.step} className="card bg-base-100 shadow-md border border-base-300 hover:shadow-lg transition-shadow">
                <div className="card-body">
                  <div className="badge badge-primary badge-lg mb-2">{item.step}</div>
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-3">{item.icon}</div>
                  <h3 className="card-title">{item.title}</h3>
                  <p className="text-base-content/60">{item.desc}</p>
                </div>
              </div>
            ))}
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
              { icon: <Smartphone className="w-6 h-6" />, title: 'Mobile First', desc: 'Use your smartphone to file claims. No computers or internet cafes needed.' },
              { icon: <ShieldCheck className="w-6 h-6" />, title: 'Fraud Protection', desc: 'GPS tagging, EXIF analysis, and AI ensure only genuine claims are processed.' },
              { icon: <Zap className="w-6 h-6" />, title: 'Fast Processing', desc: 'AI-powered analysis means claims are processed in minutes, not weeks.' },
              { icon: <Eye className="w-6 h-6" />, title: 'Full Transparency', desc: 'Track every step of your claim. See AI analysis, review status, and payout details.' },
              { icon: <Globe className="w-6 h-6" />, title: 'Multi-Language Ready', desc: 'Designed for farmers across all 28 states of India with simple, clear interface.' },
              { icon: <Building2 className="w-6 h-6" />, title: 'Government Aligned', desc: 'Supports PMFBY, WBCIS, and other government crop insurance schemes.' },
            ].map((item) => (
              <div key={item.title} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="card-body flex-row items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">{item.icon}</div>
                  <div>
                    <h3 className="font-semibold text-base-content mb-1">{item.title}</h3>
                    <p className="text-sm text-base-content/60 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 sm:py-24 bg-primary text-primary-content">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Protect Your Harvest?</h2>
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            Join thousands of farmers already using PBI AgriInsure to secure their crops.
            Filing a claim takes less than 5 minutes.
          </p>
          <button onClick={handleGetStarted} className="btn btn-lg bg-base-100 text-primary hover:bg-base-200 gap-2">
            Start Filing Your Claim <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer footer-center bg-neutral text-neutral-content p-10">
        <div className="grid grid-flow-col gap-4">
          <a href="#how-it-works" className="link link-hover">How It Works</a>
          <button onClick={() => navigate('/login')} className="link link-hover">File a Claim</button>
          <button onClick={() => navigate('/login')} className="link link-hover">Track Claim</button>
        </div>
        <div>
          <p className="flex items-center gap-2">
            <Phone className="w-4 h-4" /> Helpline: 1800-XXX-XXXX
            <span className="mx-2">|</span>
            <Mail className="w-4 h-4" /> support@pbi-agriinsure.in
          </p>
        </div>
        <div>
          <p>&copy; {new Date().getFullYear()} PBI AgriInsure. Ministry of Agriculture & Farmers Welfare, Government of India.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
