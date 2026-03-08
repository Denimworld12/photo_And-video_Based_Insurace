import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Palette } from 'lucide-react';

const themeLabels = {
  emerald: { label: 'Emerald', desc: 'Clean green' },
  bumblebee: { label: 'Bumblebee', desc: 'Warm gold' },
  halloween: { label: 'Halloween', desc: 'Dark orange' },
  forest: { label: 'Forest', desc: 'Deep green' },
  lemonade: { label: 'Lemonade', desc: 'Light citrus' },
};

export default function ThemeSwitcher({ compact = false }) {
  const { theme, setTheme, themes } = useTheme();

  if (compact) {
    return (
      <div className="dropdown dropdown-end">
        <div tabIndex={0} role="button" className="btn btn-ghost btn-sm btn-circle">
          <Palette className="w-5 h-5" />
        </div>
        <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-50 w-44 p-2 shadow-xl border border-base-300">
          {themes.map((t) => (
            <li key={t}>
              <button
                onClick={() => setTheme(t)}
                className={theme === t ? 'active font-semibold' : ''}
              >
                <span className="capitalize">{themeLabels[t]?.label || t}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {themes.map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          data-theme={t}
          className={`relative rounded-xl p-4 border-2 transition-all text-left ${
            theme === t ? 'border-primary ring-2 ring-primary/30' : 'border-base-300 hover:border-primary/50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-primary" />
              <span className="w-3 h-3 rounded-full bg-secondary" />
              <span className="w-3 h-3 rounded-full bg-accent" />
            </div>
          </div>
          <p className="text-sm font-semibold text-base-content capitalize">{themeLabels[t]?.label || t}</p>
          <p className="text-xs text-base-content/60">{themeLabels[t]?.desc || ''}</p>
          {theme === t && (
            <span className="absolute top-2 right-2 badge badge-primary badge-xs">Active</span>
          )}
        </button>
      ))}
    </div>
  );
}
