'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { SCREENING_CHAT_VERSION } from '@/lib/config';
import type { DemographicsInput, ScreeningMode } from '@/types/screening-ui';
import type { SessionPhase } from '@/features/screening-chat-v2';

/**
 * Visual detection only exists in v2. In v1 the gate is resolved from the
 * outset, so every consumer that reads `imageGateResolved` — the "Lihat Hasil"
 * button, the result-page gate check, the instructional chat message — behaves
 * as if the step were already done, and the feature never surfaces.
 *
 * Requirements: 12.1, 12.2
 */
const IMAGE_GATE_INITIALLY_RESOLVED = SCREENING_CHAT_VERSION !== 'v2';

interface ScreeningContextValue {
  sessionId: string | null;
  shareToken: string | null;
  mode: ScreeningMode | null;
  incognito: boolean;
  demographics: DemographicsInput;
  phase: SessionPhase | null;
  /** Whether the user has given consent for image submission (visual detection) */
  imageConsentGiven: boolean;
  /**
   * Whether the image gate is resolved. Starts true in v1 (the feature does not
   * exist there) and true in v2 only once a visual result has been recorded.
   */
  imageGateResolved: boolean;
  setSession: (sessionId: string, shareToken: string, mode: ScreeningMode) => void;
  setIncognito: (value: boolean) => void;
  setDemographics: (value: DemographicsInput) => void;
  setPhase: (phase: SessionPhase | null) => void;
  /** Set whether the user has given consent for image submission */
  setImageConsentGiven: (value: boolean) => void;
  /** Set whether the image gate phase is resolved */
  setImageGateResolved: (value: boolean) => void;
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
  const [imageConsentGiven, setImageConsentGiven] = useState(false);
  const [imageGateResolved, setImageGateResolved] = useState(IMAGE_GATE_INITIALLY_RESOLVED);

  const value = useMemo<ScreeningContextValue>(
    () => ({
      sessionId,
      shareToken,
      mode,
      incognito,
      demographics,
      phase,
      imageConsentGiven,
      imageGateResolved,
      setSession: (sid, token, m) => {
        setSessionId(sid);
        setShareToken(token);
        setMode(m);
      },
      setIncognito,
      setDemographics,
      setPhase,
      setImageConsentGiven,
      setImageGateResolved,
      reset: () => {
        setSessionId(null);
        setShareToken(null);
        setMode(null);
        setPhase(null);
        setImageConsentGiven(false);
        setImageGateResolved(IMAGE_GATE_INITIALLY_RESOLVED);
      },
    }),
    [
      sessionId,
      shareToken,
      mode,
      incognito,
      demographics,
      phase,
      imageConsentGiven,
      imageGateResolved,
    ],
  );

  return <ScreeningContext.Provider value={value}>{children}</ScreeningContext.Provider>;
}

export function useScreening(): ScreeningContextValue {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error('useScreening must be used within a ScreeningProvider');
  return ctx;
}
