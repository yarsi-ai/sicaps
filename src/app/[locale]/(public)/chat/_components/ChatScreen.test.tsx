/**
 * Regression coverage for the done-effect that mirrors an image submission's
 * server response into the transcript.
 *
 * Two bugs, found and fixed in sequence:
 *
 * 1. A first-try success reaches `useImageUpload.status === 'done'` with
 *    `totalAttempts === 1`, which is nowhere near
 *    `CONFIG.visualDetection.MAX_UPLOAD_FAILURES` (3). The effect used to gate
 *    *every* `done` on retries being exhausted, so a successful upload's
 *    botMessage and the perception question that follows it were computed by
 *    the server, returned in the response, and then silently never rendered —
 *    the santri saw the photo appear and nothing else.
 *
 * 2. Once (1) was fixed, the effect still hard-coded the third
 *    `appendImageTurn` argument to `null` unconditionally, discarding
 *    `followUpMessage` even on success. The server had already asked the
 *    severity question — it marks `perceptionStep: ASK_SEVERITY` in the
 *    database whenever it returns a non-null followUpMessage — but the santri
 *    never saw it rendered. Their next reply ("baik") answered a question that
 *    was invisible on screen, and the classifier's "coba jawab pakai angka"
 *    fallback fired because nothing in the reply matched a severity or a
 *    barrier. Withholding followUpMessage is only correct on a prediction
 *    failure, where botMessage itself already ends in a question ("Siap
 *    lanjut?") that a second question would collide with.
 *
 * Requirements: 2.2 (visual-detection)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { UseImageUploadReturn } from '../_hooks/useImageUpload';
import type { ChipsRequest } from '@/features/screening-chat-v2/domain/types';

vi.mock('next-intl', () => ({
  useLocale: () => 'id',
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useVoice', () => ({
  useVoice: () => ({
    recording: false,
    voiceMode: false,
    speakingId: null,
    startSTT: vi.fn(),
    stopSTT: vi.fn(),
    speak: vi.fn(),
    toggleVoiceMode: vi.fn(),
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const mockAppendImageTurn = vi.fn();
const mockSetImageGateResolved = vi.fn();

vi.mock('../../_components/ScreeningProvider', () => ({
  useScreening: () => ({
    incognito: false,
    setIncognito: vi.fn(),
    demographics: {},
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    shareToken: 'token-1',
    imageConsentGiven: true,
    imageGateResolved: false,
    setImageConsentGiven: vi.fn(),
    setImageGateResolved: mockSetImageGateResolved,
    phase: 'AWAITING_IMAGE',
  }),
}));

/** Mutable so the chips-timing tests can drive `typing` independently. */
let chatState: {
  ready: boolean;
  msgs: unknown[];
  typing: boolean;
  finished: boolean;
  sendReply: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  chipsRequest: ChipsRequest | null;
  chipsSubState: string;
  submitChipsAnswer: ReturnType<typeof vi.fn>;
  appendImageTurn: ReturnType<typeof vi.fn>;
  appendBotMessage: ReturnType<typeof vi.fn>;
  removeMessage: ReturnType<typeof vi.fn>;
  updatePhase: ReturnType<typeof vi.fn>;
};

function baseChatState(overrides: Partial<typeof chatState> = {}): typeof chatState {
  return {
    ready: true,
    msgs: [],
    typing: false,
    finished: false,
    sendReply: vi.fn(),
    retry: vi.fn(),
    chipsRequest: null,
    chipsSubState: 'FREE_TEXT',
    submitChipsAnswer: vi.fn(),
    appendImageTurn: mockAppendImageTurn,
    appendBotMessage: vi.fn(),
    removeMessage: vi.fn(),
    updatePhase: vi.fn(),
    ...overrides,
  };
}

vi.mock('../_hooks/useChat', () => ({
  useChat: () => chatState,
}));

/** Mutable so each test can drive the hook through upload -> done. */
let imageUploadState: UseImageUploadReturn;

vi.mock('../_hooks/useImageUpload', () => ({
  useImageUpload: () => imageUploadState,
}));

function baseImageUploadState(overrides: Partial<UseImageUploadReturn> = {}): UseImageUploadReturn {
  return {
    status: 'idle',
    imageId: null,
    error: null,
    localUrl: null,
    botMessage: null,
    followUpMessage: null,
    visualResult: null,
    finalOutput: null,
    predictionFailed: false,
    phase: null,
    failedAttempts: 0,
    totalAttempts: 0,
    upload: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

// Imported after the mocks above so ChatScreen picks them up.
import ChatScreen from './ChatScreen';

describe('ChatScreen image submission feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatState = baseChatState();
  });

  it('shows the server response on a first-try success, without waiting for retries', async () => {
    // totalAttempts: 1 is nowhere near MAX_UPLOAD_FAILURES (3) — the bug this
    // guards against gated every 'done' status on that count regardless of
    // whether the attempt actually failed.
    imageUploadState = baseImageUploadState({
      status: 'done',
      localUrl: 'blob:preview',
      botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
      followUpMessage: 'Menurut kamu, keluhan ini seberapa berat?',
      predictionFailed: false,
      phase: 'ASKING_PERCEPTION',
      totalAttempts: 1,
    });

    render(<ChatScreen />);

    await waitFor(() => expect(mockAppendImageTurn).toHaveBeenCalledTimes(1));

    expect(mockAppendImageTurn).toHaveBeenCalledWith(
      'blob:preview',
      'Fotonya udah aku terima dan berhasil dianalisis.',
      // The severity question the server already asked (and recorded as asked
      // in perceptionStep) must actually render — discarding it here is what
      // left a later reply answering a question the santri never saw.
      'Menurut kamu, keluhan ini seberapa berat?',
      undefined, // no imageFailure — the upload and the analysis both succeeded
    );
    expect(mockSetImageGateResolved).toHaveBeenCalledWith(true);
  });

  it('shows no follow-up when the phase genuinely owes none on success', async () => {
    imageUploadState = baseImageUploadState({
      status: 'done',
      localUrl: 'blob:preview',
      botMessage: 'Fotonya udah aku terima dan berhasil dianalisis.',
      followUpMessage: null,
      predictionFailed: false,
      phase: 'AWAITING_IMAGE',
      totalAttempts: 1,
    });

    render(<ChatScreen />);

    await waitFor(() => expect(mockAppendImageTurn).toHaveBeenCalledTimes(1));

    expect(mockAppendImageTurn).toHaveBeenCalledWith(
      'blob:preview',
      'Fotonya udah aku terima dan berhasil dianalisis.',
      null,
      undefined,
    );
  });

  it('waits for retries to exhaust before showing feedback on a prediction failure', async () => {
    imageUploadState = baseImageUploadState({
      status: 'done',
      localUrl: 'blob:preview',
      botMessage: 'Fotonya udah masuk, tapi belum berhasil aku analisis.',
      followUpMessage: null,
      predictionFailed: true,
      phase: 'AWAITING_IMAGE',
      totalAttempts: 1,
    });

    render(<ChatScreen />);

    // One attempt of three — the santri still has a chance to retry with a
    // different photo, so the effect must not have committed anything yet.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockAppendImageTurn).not.toHaveBeenCalled();
  });

  it('shows the prediction-failure message once retries are exhausted', async () => {
    imageUploadState = baseImageUploadState({
      status: 'done',
      localUrl: 'blob:preview',
      botMessage: 'Fotonya udah masuk, tapi belum berhasil aku analisis.',
      followUpMessage: null,
      predictionFailed: true,
      phase: 'ASKING_PERCEPTION',
      totalAttempts: 3,
    });

    render(<ChatScreen />);

    await waitFor(() => expect(mockAppendImageTurn).toHaveBeenCalledTimes(1));

    expect(mockAppendImageTurn).toHaveBeenCalledWith(
      'blob:preview',
      'Fotonya udah masuk, tapi belum berhasil aku analisis.',
      null,
      'analysis',
    );
  });

  it('withholds the follow-up on a prediction failure even when the server sent one', async () => {
    // botMessage itself ends in "Siap lanjut?" — a question. Showing the
    // severity question in the same turn would stack a second question on top.
    imageUploadState = baseImageUploadState({
      status: 'done',
      localUrl: 'blob:preview',
      botMessage: 'Fotonya udah masuk, tapi belum berhasil aku analisis. Siap lanjut?',
      followUpMessage: 'Menurut kamu, keluhan ini seberapa berat?',
      predictionFailed: true,
      phase: 'ASKING_PERCEPTION',
      totalAttempts: 3,
    });

    render(<ChatScreen />);

    await waitFor(() => expect(mockAppendImageTurn).toHaveBeenCalledTimes(1));

    expect(mockAppendImageTurn).toHaveBeenCalledWith(
      'blob:preview',
      'Fotonya udah masuk, tapi belum berhasil aku analisis. Siap lanjut?',
      null,
      'analysis',
    );
  });
});

/**
 * Regression coverage for the chips-answer-buttons-before-their-question bug.
 *
 * The server streams a chips question's intro as `token` events, which only
 * become a transcript bubble once `done` arrives and `useChat` flushes its
 * token buffer into `msgs`. `chips_request` — which populates `chipsRequest`
 * and renders the answer buttons — arrives on the same turn but earlier, while
 * `typing` is still true. Rendering the buttons as soon as `chipsRequest`
 * existed, independent of `typing`, showed the answer buttons on screen before
 * the question bubble they answer.
 */
describe('ChatScreen chips selector timing', () => {
  const CHIPS_REQUEST: ChipsRequest = {
    id: 'chips-asrama-1',
    type: 'single',
    question: '',
    options: [
      { token: 'true', label: 'Iya, di pondok/asrama' },
      { token: 'false', label: 'Enggak' },
    ],
    allowFreeText: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    imageUploadState = baseImageUploadState();
  });

  it('does not show the answer buttons while the intro text is still streaming', () => {
    chatState = baseChatState({ typing: true, chipsRequest: CHIPS_REQUEST });

    render(<ChatScreen />);

    expect(screen.queryByRole('button', { name: 'Iya, di pondok/asrama' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enggak' })).not.toBeInTheDocument();
  });

  it('shows the answer buttons once the intro text has landed in the transcript', () => {
    chatState = baseChatState({ typing: false, chipsRequest: CHIPS_REQUEST });

    render(<ChatScreen />);

    expect(screen.getByRole('button', { name: 'Iya, di pondok/asrama' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enggak' })).toBeInTheDocument();
  });
});
