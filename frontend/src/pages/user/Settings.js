import React from 'react';
import ThemeSwitcher from '../../components/ThemeSwitcher';
import { Settings as SettingsIcon, Palette, Info } from 'lucide-react';

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
            <Info className="w-5 h-5 text-primary" /> About
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-base-content/60">App Name</span>
              <span className="font-medium">Crop Insurance Platform</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">Version</span>
              <span className="font-medium">2.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/60">Technology</span>
              <span className="font-medium">AI-Powered Photo Analysis</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
