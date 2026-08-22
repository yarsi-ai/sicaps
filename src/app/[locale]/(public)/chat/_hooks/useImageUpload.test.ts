/**
 * Tests for useImageUpload.
 *
 * The submit request is synchronous end to end, so reaching `done` must carry
 * the resolved visual result — that is what unlocks the result page.
 *
 * Requirements: 2.2, 4.6, 5.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useImageUpload } from './useImageUpload';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

const originalFetch = global.fetch;

function makeFile(): File {
  return new File(['image-bytes'], 'skin.jpg', { type: 'image/jpeg' });
}

function envelope(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    meta: { timestamp: '2026-08-11T00:00:00.000Z', requestId: 'req-1' },
  };
}

function mockJsonResponse(body: unknown, ok = true, status = 201) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

const successBody = envelope({
  imageId: 'image-1',
  botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
  followUpMessage: 'Menurut kamu, seberapa berat kondisi kulit kamu?',
  phase: 'ASKING_PERCEPTION',
  visualResult: 'POSITIVE',
  predictionFailed: false,
  finalOutput: 'SUSPECTED_SCABIES',
});

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn(() => 'blob:preview');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  // The object-URL stubs are deliberately left in place: jsdom does not
  // implement them, and Testing Library's auto-cleanup unmounts *after* this
  // hook, at which point the hook's cleanup effect still calls revokeObjectURL.
});

describe('useImageUpload', () => {
  it('starts idle with no preview', () => {
    const { result } = renderHook(() => useImageUpload());

    expect(result.current.status).toBe('idle');
    expect(result.current.localUrl).toBeNull();
    expect(result.current.visualResult).toBeNull();
    expect(result.current.predictionFailed).toBe(false);
  });

  it('creates a local preview URL when the upload starts', async () => {
    global.fetch = mockJsonResponse(successBody);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.current.localUrl).toBe('blob:preview');
  });

  it('posts multipart form data with the session id and consent flag', async () => {
    const fetchMock = mockJsonResponse(successBody);
    global.fetch = fetchMock;
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/screening/image', {
      method: 'POST',
      body: expect.any(FormData),
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('sessionId')).toBe(SESSION_ID);
    expect(body.get('consentGiven')).toBe('true');
    expect(body.get('image')).toBeInstanceOf(File);
  });

  it('reaches done carrying the resolved visual result', async () => {
    global.fetch = mockJsonResponse(successBody);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.imageId).toBe('image-1');
    expect(result.current.visualResult).toBe('POSITIVE');
    expect(result.current.finalOutput).toBe('SUSPECTED_SCABIES');
    expect(result.current.predictionFailed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('carries the question the next phase owes, since no chat turn follows the upload', async () => {
    global.fetch = mockJsonResponse(successBody);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.followUpMessage).toBe('Menurut kamu, seberapa berat kondisi kulit kamu?');
  });

  it('carries a null follow-up when the photo did not move the phase forward', async () => {
    global.fetch = mockJsonResponse(
      envelope({
        imageId: 'image-4',
        botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
        followUpMessage: null,
        phase: 'AWAITING_IMAGE',
        visualResult: 'POSITIVE',
        predictionFailed: false,
        finalOutput: null,
      }),
    );
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.followUpMessage).toBeNull();
  });

  it('surfaces the permanent-failure fallback as a resolved submission', async () => {
    global.fetch = mockJsonResponse(
      envelope({
        imageId: 'image-2',
        botMessage: 'Fotonya udah masuk, tapi belum berhasil aku analisis.',
        followUpMessage: 'Menurut kamu, seberapa berat kondisi kulit kamu?',
        phase: 'ASKING_PERCEPTION',
        visualResult: 'NEGATIVE',
        predictionFailed: true,
        finalOutput: 'NOT_SCABIES',
      }),
    );
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(result.current.status).toBe('done');
    expect(result.current.predictionFailed).toBe(true);
    expect(result.current.visualResult).toBe('NEGATIVE');
  });

  it('accepts a null final output when the session has no result row', async () => {
    global.fetch = mockJsonResponse(
      envelope({
        imageId: 'image-3',
        botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
        followUpMessage: 'Menurut kamu, seberapa berat kondisi kulit kamu?',
        phase: 'ASKING_PERCEPTION',
        visualResult: 'NEGATIVE',
        predictionFailed: false,
        finalOutput: null,
      }),
    );
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(result.current.status).toBe('done');
    expect(result.current.finalOutput).toBeNull();
  });

  describe('error handling', () => {
    it('reports the API error message on a rejected request', async () => {
      global.fetch = mockJsonResponse(
        envelope(null, {
          code: 'CONSENT_REQUIRED',
          message: 'Image consent is required',
          details: null,
        }),
        false,
        400,
      );
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Image consent is required');
    });

    it('reports an error when the response does not match the contract', async () => {
      global.fetch = mockJsonResponse(envelope({ imageId: 'image-1' }));
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Unexpected response from server');
    });

    it('reports an error when the visual result is not a known value', async () => {
      global.fetch = mockJsonResponse(
        envelope({
          imageId: 'image-1',
          visualResult: 'MAYBE',
          predictionFailed: false,
          finalOutput: null,
        }),
      );
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      expect(result.current.status).toBe('error');
    });

    it('reports a network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Failed to fetch');
    });

    it('keeps the preview visible on error so the user sees what failed', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      expect(result.current.localUrl).toBe('blob:preview');
    });
  });

  describe('reset', () => {
    it('returns to idle and revokes the preview URL', async () => {
      global.fetch = mockJsonResponse(successBody);
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.upload(makeFile(), SESSION_ID);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.localUrl).toBeNull();
      expect(result.current.visualResult).toBeNull();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });
  });

  it('preserves failedAttempts across retries', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network drop'))
      .mockRejectedValueOnce(new Error('network drop'))
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              imageId: 'image-1',
              botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
              followUpMessage: null,
              phase: 'ASKING_PERCEPTION',
              visualResult: 'POSITIVE',
              predictionFailed: false,
              finalOutput: 'SUSPECTED_SCABIES',
            },
            error: null,
            meta: { timestamp: '2026-08-13T00:00:00.000Z', requestId: 'req-1' },
          }),
      });
    global.fetch = mockFetch;
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.failedAttempts).toBe(1);

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.failedAttempts).toBe(2);

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.status).toBe('done');
    // Success resets to zero via INITIAL_STATE but the current impl only
    // resets on explicit reset() — the counter is always preserved until reset.
    // Validate the done state is correct regardless:
    expect(result.current.visualResult).toBe('POSITIVE');
  });

  it('increments failedAttempts on an HTTP error response', async () => {
    global.fetch = mockJsonResponse(
      envelope(null, { code: 'INTERNAL_ERROR', message: 'Server error', details: null }),
      false,
      500,
    );
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.failedAttempts).toBe(1);
  });

  it('increments failedAttempts on a network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(result.current.failedAttempts).toBe(1);
  });

  it('resets failedAttempts to 0 on reset()', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.failedAttempts).toBe(1);

    act(() => {
      result.current.reset();
    });
    expect(result.current.failedAttempts).toBe(0);
  });

  it('revokes the previous preview URL when a second file is uploaded', async () => {
    global.fetch = mockJsonResponse(successBody);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('tracks totalAttempts across all uploads (success and failure)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network drop'))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              imageId: 'image-1',
              botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
              followUpMessage: null,
              phase: 'ASKING_PERCEPTION',
              visualResult: 'POSITIVE',
              predictionFailed: false,
              finalOutput: 'SUSPECTED_SCABIES',
            },
            error: null,
            meta: { timestamp: '2026-08-13T00:00:00.000Z', requestId: 'req-1' },
          }),
      })
      .mockRejectedValueOnce(new Error('network drop'));
    global.fetch = mockFetch;
    const { result } = renderHook(() => useImageUpload());

    // First attempt fails
    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.totalAttempts).toBe(1);
    expect(result.current.failedAttempts).toBe(1);

    // Second attempt succeeds
    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.totalAttempts).toBe(2);
    expect(result.current.failedAttempts).toBe(1); // Still 1, success doesn't increment failed

    // Third attempt fails
    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.totalAttempts).toBe(3);
    expect(result.current.failedAttempts).toBe(2);
  });

  it('resets totalAttempts to 0 on reset()', async () => {
    global.fetch = mockJsonResponse(successBody);
    const { result } = renderHook(() => useImageUpload());

    await act(async () => {
      await result.current.upload(makeFile(), SESSION_ID);
    });
    expect(result.current.totalAttempts).toBe(1);

    act(() => {
      result.current.reset();
    });
    expect(result.current.totalAttempts).toBe(0);
  });
});
