'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { imageSubmitResultEnvelopeSchema, type FinalOutput, type VisualResult } from '@/lib/vision';
import type { ImageUploadStatus } from '@/types/screening-ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseImageUploadState {
  /** Current upload status. `done` means the prediction has also resolved. */
  status: ImageUploadStatus;
  /** The image ID returned from the API on successful upload */
  imageId: string | null;
  /** Error message for user-friendly display */
  error: string | null;
  /** Object URL for local image preview (created from the File) */
  localUrl: string | null;
  /** Server-authored bot reply for this submission, or null before it lands. */
  botMessage: string | null;
  /** Question the phase after the gate owes, when there is one. */
  followUpMessage: string | null;
  /** Visual detection result (POSITIVE/NEGATIVE) */
  visualResult: VisualResult | null;
  /** Final combined output from chat risk + visual detection */
  finalOutput: FinalOutput | null;
  /** Whether the visual prediction failed after exhausting retries */
  predictionFailed: boolean;
  /** The session phase returned by the server after the upload resolved. */
  phase: string | null;
  /**
   * How many times a transport-level failure has been recorded for this session.
   * Incremented on network errors and HTTP failures; NOT incremented on
   * server-side prediction retries (those happen inside a single successful
   * HTTP request). Resets to 0 on reset() and on every new upload() call.
   */
  failedAttempts: number;
  /**
   * Total number of upload attempts (both successful and failed).
   * Used to determine when the user has exhausted all retry opportunities.
   */
  totalAttempts: number;
}

export interface UseImageUploadActions {
  /** Upload a file to the screening image API */
  upload: (file: File, sessionId: string) => Promise<void>;
  /** Retry the last failed upload with the same file */
  retry: (sessionId: string) => Promise<void>;
  /** Reset the hook state to idle */
  reset: () => void;
}

export type UseImageUploadReturn = UseImageUploadState & UseImageUploadActions;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_STATE: UseImageUploadState = {
  status: 'idle',
  imageId: null,
  botMessage: null,
  followUpMessage: null,
  error: null,
  localUrl: null,
  visualResult: null,
  finalOutput: null,
  predictionFailed: false,
  phase: null,
  failedAttempts: 0,
  totalAttempts: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the single image submission for a screening session.
 *
 * The POST request is synchronous end to end: the server runs the bounded
 * prediction retry loop before responding, so reaching `done` means the image
 * gate has genuinely resolved — there is nothing left to poll for.
 *
 * Requirements: 2.2, 4.6, 5.1
 */
export function useImageUpload(): UseImageUploadReturn {
  const [state, setState] = useState<UseImageUploadState>(INITIAL_STATE);
  const localUrlRef = useRef<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  // Track failed attempts with a ref so reads are always synchronous —
  // relying on prev.failedAttempts inside setState suffers from batching:
  // if the user taps "+" before the previous setState has flushed, two
  // uploads can both read the same stale value and the counter does not
  // advance correctly.
  const failedAttemptsRef = useRef(0);
  // Track total attempts (success + failure) to know when retries are exhausted
  const totalAttemptsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = null;
      }
    };
  }, []);

  const upload = useCallback(async (file: File, sessionId: string): Promise<void> => {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
    }

    const localUrl = URL.createObjectURL(file);
    localUrlRef.current = localUrl;
    lastFileRef.current = file;

    // Increment total attempts at the start of each upload
    totalAttemptsRef.current += 1;
    const currentTotal = totalAttemptsRef.current;

    // Preserve failedAttempts across retries — only reset when the gate
    // resolves (on success or explicit reset()), not at the start of each try.
    const currentFailed = failedAttemptsRef.current;
    setState({
      ...INITIAL_STATE,
      status: 'uploading',
      localUrl,
      failedAttempts: currentFailed,
      totalAttempts: currentTotal,
    });

    // Minimum display time for loading indicator so user sees feedback
    const MIN_LOADING_MS = 500;
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('consentGiven', 'true');
      formData.append('image', file);

      const response = await fetch('/api/screening/image', {
        method: 'POST',
        body: formData,
      });

      const envelope = imageSubmitResultEnvelopeSchema.safeParse(await response.json());

      // Ensure minimum loading time before showing result
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }

      if (!envelope.success) {
        failedAttemptsRef.current += 1;
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: 'Unexpected response from server',
          failedAttempts: failedAttemptsRef.current,
          totalAttempts: currentTotal,
        }));
        return;
      }

      const { data, error } = envelope.data;

      if (!response.ok || error !== null || data === null) {
        failedAttemptsRef.current += 1;
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: error?.message ?? 'Upload failed',
          failedAttempts: failedAttemptsRef.current,
          totalAttempts: currentTotal,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'done',
        imageId: data.imageId,
        botMessage: data.botMessage,
        followUpMessage: data.followUpMessage,
        visualResult: data.visualResult,
        finalOutput: data.finalOutput,
        predictionFailed: data.predictionFailed,
        phase: data.phase,
        error: null,
        totalAttempts: currentTotal,
      }));
    } catch (err) {
      // Ensure minimum loading time even for errors
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS - elapsed));
      }

      failedAttemptsRef.current += 1;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Network error occurred',
        failedAttempts: failedAttemptsRef.current,
        totalAttempts: currentTotal,
      }));
    }
  }, []);

  const retry = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!lastFileRef.current) return;
      await upload(lastFileRef.current, sessionId);
    },
    [upload],
  );

  const reset = useCallback((): void => {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }

    lastFileRef.current = null;
    failedAttemptsRef.current = 0;
    totalAttemptsRef.current = 0;
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    upload,
    retry,
    reset,
  };
}
