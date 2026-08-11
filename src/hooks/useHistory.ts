'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry } from '@/types/screening-ui';

const STORAGE_KEY = 'sicaps_history_v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    const now = Date.now();
    const fresh = parsed.filter((h) => now - new Date(h.createdAt).getTime() < MAX_AGE_MS);
    if (fresh.length !== parsed.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* localStorage unavailable (private mode, quota, etc.) */
  }
}

/**
 * Client-side CRUD over the screening history, backed by localStorage with a
 * 30-day auto-expire. Per the Phase 1 spec: history never touches a server —
 * only sessionId/shareToken/score/mode metadata is stored here; the full
 * transcript is re-fetched (via shareToken) only when a card is opened.
 */
export function useHistory() {
  const [state, setState] = useState<{ entries: HistoryEntry[]; hydrated: boolean }>({
    entries: [],
    hydrated: false,
  });

  useEffect(() => {
    // localStorage is unavailable during SSR/initial hydration render, so
    // this one-time client read must happen post-mount via an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ entries: loadHistory(), hydrated: true });
  }, []);

  const addEntry = useCallback((entry: HistoryEntry) => {
    setState((prev) => {
      const entries = [entry, ...prev.entries];
      persist(entries);
      return { ...prev, entries };
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setState((prev) => {
      const entries = prev.entries.filter((e) => e.id !== id);
      persist(entries);
      return { ...prev, entries };
    });
  }, []);

  return {
    entries: state.entries,
    hydrated: state.hydrated,
    addEntry,
    removeEntry,
  };
}
