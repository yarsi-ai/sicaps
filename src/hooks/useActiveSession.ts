'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'sicaps_active_session';

export interface ActiveSessionData {
  sessionId: string;
  createdAt: string;
}

/**
 * Persist and retrieve the currently active (in-progress) screening session.
 * Used to detect unfinished sessions when user returns to the landing page.
 */
export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(() =>
    loadActiveSession(),
  );

  const save = useCallback((sessionId: string) => {
    const data: ActiveSessionData = { sessionId, createdAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* localStorage unavailable */
    }
    setActiveSession(data);
  }, []);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setActiveSession(null);
  }, []);

  return { activeSession, hydrated: true, save, clear };
}

/** Read active session from localStorage (safe for SSR). */
export function loadActiveSession(): ActiveSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionData;
  } catch {
    return null;
  }
}

/** Clear active session from localStorage. */
export function clearActiveSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Save active session to localStorage. */
export function saveActiveSession(sessionId: string): void {
  try {
    const data: ActiveSessionData = { sessionId, createdAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
