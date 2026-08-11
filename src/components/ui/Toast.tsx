'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const TOAST_MS = 2200;

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), TOAST_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="animate-sc-pop fixed bottom-6 left-1/2 z-[101] -translate-x-1/2 rounded-pill bg-text-strong px-5 py-[11px] text-[13px] font-bold text-text-cream shadow-sticker-lg"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
