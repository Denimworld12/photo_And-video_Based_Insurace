import React from 'react';
import ThemeSwitcher from '../../components/ThemeSwitcher';
import { Settings as SettingsIcon, Palette, Info, ShieldCheck, Globe, Phone } from 'lucide-react';

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary" /> Settings
        </h1>
        <p className="text-sm text-base-content/50 mt-1">Customize your experience</p>
      </div>

      {/* Theme Section */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary" /> Appearance
          </h3>
          <p className="text-sm text-base-content/60 mb-4">
            Choose a theme that suits your preference. Changes are applied instantly and saved across sessions.
          </p>
          <ThemeSwitcher mode="full" />
        </div>
      </div>

      {/* App Info */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h3 className="font-semibold text-base-content flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-primary" /> About PBI AgriInsure
          </h3>
          <div className="flex items-center gap-4 mb-4 p-4 bg-base-200 rounded-xl">
            <img src="/images/government-emblem.png" alt="Government Emblem" className="w-12 h-12 object-contain" />
            <div>
              <p className="font-semibold text-base-content">PBI AgriInsure</p>
              <p className="text-xs text-base-content/50">Photo & Video-Based Insurance Assessment</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Version', value: '2.0.0', icon: ShieldCheck },
              { label: 'Technology', value: 'AI-Powered Photo Analysis (Gemini)', icon: Globe },
              { label: 'Helpline', value: '1800-180-1551 (Toll Free)', icon: Phone },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-base-200 last:border-0">
                <span className="flex items-center gap-2 text-base-content/60">
                  <item.icon className="w-4 h-4" /> {item.label}
                </span>
                <span className="font-medium text-base-content">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
