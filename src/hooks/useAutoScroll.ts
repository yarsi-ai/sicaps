'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_THRESHOLD = 80;

/**
 * Auto-scrolls a container to the bottom whenever `trigger` changes, but only
 * if the user was already near the bottom — so scrolling up to re-read the
 * transcript doesn't get yanked back down by a new incoming message.
 */
export function useAutoScroll<T extends HTMLElement>(trigger: unknown) {
  const scrollRef = useRef<T | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distance < NEAR_BOTTOM_THRESHOLD);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkNearBottom, { passive: true });
    return () => el.removeEventListener('scroll', checkNearBottom);
  }, [checkNearBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [trigger, isNearBottom]);

  return { scrollRef, isNearBottom };
}
