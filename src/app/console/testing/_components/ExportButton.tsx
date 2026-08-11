'use client';

import { useState, useRef, useEffect } from 'react';
import { useTestingContext } from './TestingContext';

export function ExportButton() {
  const { state } = useTestingContext();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleExport = (scope: 'session' | 'all') => {
    setOpen(false);
    const params = new URLSearchParams();
    if (scope === 'session' && state.sessionId) {
      params.set('sessionId', state.sessionId);
    }
    window.open(`/api/test/evaluations/export?${params.toString()}`, '_blank');
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#e2ddd0] bg-white px-3 py-1.5 text-[11px] font-medium text-[#6b5e4f] transition hover:border-[#cfc9bd] hover:bg-[#f7f4ee]"
      >
        <span className="text-[#b9b2a3]">↓</span>
        Export CSV
        <span className="text-[8px] text-[#b9b2a3]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-lg border border-[#e2ddd0] bg-white py-1 shadow-lg">
          <button
            onClick={() => handleExport('session')}
            disabled={!state.sessionId}
            className="block w-full px-3 py-2 text-left text-[11px] text-[#4a4035] transition hover:bg-[#f7f4ee] disabled:text-[#cfc9bd]"
          >
            Session ini saja
          </button>
          <button
            onClick={() => handleExport('all')}
            className="block w-full px-3 py-2 text-left text-[11px] text-[#4a4035] transition hover:bg-[#f7f4ee]"
          >
            Semua testing data
          </button>
        </div>
      )}
    </div>
  );
}
