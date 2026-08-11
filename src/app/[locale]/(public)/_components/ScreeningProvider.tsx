'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { DemographicsInput, ScreeningMode } from '@/types/screening-ui';
import type { SessionPhase } from '@/features/screening-chat-v2';

interface ScreeningContextValue {
  sessionId: string | null;
  shareToken: string | null;
  mode: ScreeningMode | null;
  incognito: boolean;
  demographics: DemographicsInput;
  phase: SessionPhase | null;
  setSession: (sessionId: string, shareToken: string, mode: ScreeningMode) => void;
  setIncognito: (value: boolean) => void;
  setDemographics: (value: DemographicsInput) => void;
  setPhase: (phase: SessionPhase | null) => void;
  reset: () => void;
}

const ScreeningContext = createContext<ScreeningContextValue | null>(null);

/**
 * Cross-route screening state (sessionId, mode, incognito). Mounted once in
 * the (public) layout so it survives client-side navigation between
 * /demographics -> /chat -> /result without a full reload. It's in-memory only
 * — a hard refresh starts a fresh anonymous session, by design.
 */
export function ScreeningProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [mode, setMode] = useState<ScreeningMode | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [demographics, setDemographics] = useState<DemographicsInput>({});
  const [phase, setPhase] = useState<SessionPhase | null>(null);

  const value = useMemo<ScreeningContextValue>(
    () => ({
      sessionId,
      shareToken,
      mode,
      incognito,
      demographics,
      phase,
      setSession: (sid, token, m) => {
        setSessionId(sid);
        setShareToken(token);
        setMode(m);
      },
      setIncognito,
      setDemographics,
      setPhase,
      reset: () => {
        setSessionId(null);
        setShareToken(null);
        setMode(null);
        setPhase(null);
      },
    }),
    [sessionId, shareToken, mode, incognito, demographics, phase],
  );

  return <ScreeningContext.Provider value={value}>{children}</ScreeningContext.Provider>;
}

export function useScreening(): ScreeningContextValue {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error('useScreening must be used within a ScreeningProvider');
  return ctx;
}
