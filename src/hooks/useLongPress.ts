'use client';

import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  delay?: number;
}

/** Press-and-hold gesture detection (WhatsApp-style), default 420ms. */
export function useLongPress({ onLongPress, delay = 420 }: UseLongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(onLongPress, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
  };
}
