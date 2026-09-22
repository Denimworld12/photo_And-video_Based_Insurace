import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

/**
 * App-wide toast feedback.
 *
 * Replaces the window.alert() calls that were scattered across the admin
 * pages: a native alert blocks the whole tab, cannot be styled, and only
 * ever reported failures — successful actions gave the user nothing at all.
 */

const ToastContext = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const TONE = {
  success: { Icon: CheckCircle2, panel: 'border-sage bg-sage/10', icon: 'text-deep-olive' },
  error: { Icon: AlertTriangle, panel: 'border-saddle bg-saddle/10', icon: 'text-saddle' },
  info: { Icon: Info, panel: 'border-loam bg-parchment', icon: 'text-bark' },
};

function Toast({ toast, onDismiss }) {
  const { Icon, panel, icon } = TONE[toast.tone] || TONE.info;

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 ${panel}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} aria-hidden="true" />
      <p className="flex-1 text-body text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="btn btn-ghost btn-xs btn-circle text-bark"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, tone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    return id;
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:w-96"
      >
        {toasts.map((t) => (
          <AutoDismiss key={t.id} id={t.id} onDismiss={dismiss}>
            <Toast toast={t} onDismiss={dismiss} />
          </AutoDismiss>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function AutoDismiss({ id, onDismiss, children }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 6000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);
  return children;
}
