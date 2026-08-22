/**
 * Tests for the visual detection service orchestration.
 *
 * Covers the whole pipeline the design specifies: upload, the bounded retry
 * loop, the permanent-failure fallback, result combination, persistence, and
 * duplicate-submission idempotency.
 *
 * Requirements: 2.2, 4.1, 4.3, 7.1, 7.3, 8.1, 8.2, 9.7, 10.1, 10.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/prisma', () => ({
  prisma: {
    screeningSession: { findUnique: vi.fn() },
    screeningImage: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    screeningResult: { findUnique: vi.fn(), update: vi.fn() },
    chatMessage: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./storage.service', () => ({
  uploadScreeningImage: vi.fn(),
  isStorageConfigured: vi.fn(),
}));

// Leaving the photo gate is the v2 state machine's job; this service only has to
// call it and carry the answer. Its own transitions are covered in
// screening.service.test.ts and state-machine.test.ts.
vi.mock('@/features/screening-chat-v2', () => ({
  advancePhaseAfterImage: vi.fn(),
}));

vi.mock('./vision-api.service', () => ({
  predictVisual: vi.fn(),
  VisionPredictionError: class VisionPredictionError extends Error {
    constructor(
      message: string,
      public readonly reason: string,
    ) {
      super(message);
    }
  },
}));

import { prisma } from '@/db/prisma';
import { advancePhaseAfterImage } from '@/features/screening-chat-v2';
import { NotFoundError } from '@/lib/errors';

import { isStorageConfigured, uploadScreeningImage } from './storage.service';
import { predictVisual } from './vision-api.service';
import {
  ConsentRequiredError,
  getImageGateStatus,
  submitImage,
  type SubmitImageInput,
} from './visual-detection.service';

const mockSession = vi.mocked(prisma.screeningSession.findUnique);
const mockImageFind = vi.mocked(prisma.screeningImage.findUnique);
const mockImageCreate = vi.mocked(prisma.screeningImage.create);
const mockImageUpdate = vi.mocked(prisma.screeningImage.update);
const mockResultFind = vi.mocked(prisma.screeningResult.findUnique);
const mockResultUpdate = vi.mocked(prisma.screeningResult.update);
const mockUpload = vi.mocked(uploadScreeningImage);
const mockIsStorageConfigured = vi.mocked(isStorageConfigured);
const mockPredict = vi.mocked(predictVisual);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockChatMessageCreate = vi.mocked(prisma.chatMessage.create);
const mockAdvancePhase = vi.mocked(advancePhaseAfterImage);

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = 'image-1';
const PERCEPTION_QUESTION =
  'Oke, info gejala sudah cukup lengkap. Nah menurut kamu, keluhan gatal ini termasuk (1) biasa aja, (2) cukup mengganggu, atau (3) bikin khawatir banget?';

const validInput: SubmitImageInput = {
  sessionId: SESSION_ID,
  fileBuffer: Buffer.from('image-bytes'),
  fileName: 'skin.jpg',
  mimeType: 'image/jpeg',
  fileSize: 11,
  consentGiven: true,
};

/** Wire up the happy-path collaborators; individual tests override as needed. */
function arrangeNewSubmission(riskLevel: 'LOW' | 'MODERATE' | 'HIGH' = 'MODERATE'): void {
  mockSession.mockResolvedValue({
    id: SESSION_ID,
    locale: 'id',
    phase: 'AWAITING_IMAGE',
  } as never);
  // Mirrors the real contract: a suppressed follow-up is not returned, so the
  // caller cannot record a question the santri never saw.
  mockAdvancePhase.mockImplementation(async (_sessionId, options) => ({
    phase: 'ASKING_PERCEPTION',
    followUpMessage: options?.suppressFollowUp ? null : PERCEPTION_QUESTION,
  }));
  mockTransaction.mockResolvedValue([] as never);
  mockImageFind.mockResolvedValue(null as never);
  mockIsStorageConfigured.mockReturnValue(true);
  mockUpload.mockResolvedValue({ storagePath: `${SESSION_ID}/123.jpg` });
  mockImageCreate.mockResolvedValue({ id: IMAGE_ID } as never);
  mockImageUpdate.mockResolvedValue({ id: IMAGE_ID } as never);
  mockResultFind.mockResolvedValue({ id: 'result-1', riskLevel } as never);
  mockResultUpdate.mockResolvedValue({ id: 'result-1' } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitImage', () => {
  describe('preconditions', () => {
    it('rejects a submission without consent', async () => {
      await expect(submitImage({ ...validInput, consentGiven: false })).rejects.toBeInstanceOf(
        ConsentRequiredError,
      );

      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('rejects a submission for an unknown session', async () => {
      mockSession.mockResolvedValue(null as never);

      await expect(submitImage(validInput)).rejects.toBeInstanceOf(NotFoundError);

      expect(mockUpload).not.toHaveBeenCalled();
    });
  });

  describe('first-attempt success', () => {
    it('uploads, stores the image, and returns the visual result', async () => {
      arrangeNewSubmission();
      mockPredict.mockResolvedValue({ result: 'POSITIVE', confidence: 91.5 });

      const result = await submitImage(validInput);

      expect(mockUpload).toHaveBeenCalledWith(SESSION_ID, validInput.fileBuffer, 'image/jpeg');
      expect(result).toEqual({
        imageId: IMAGE_ID,
        botMessage: expect.stringContaining('berhasil dianalisis'),
        followUpMessage: PERCEPTION_QUESTION,
        phase: 'ASKING_PERCEPTION',
        visualResult: 'POSITIVE',
        predictionFailed: false,
        finalOutput: 'SUSPECTED_SCABIES',
      });
    });

    it('advances the phase out of the gate once a visual result exists', async () => {
      arrangeNewSubmission();
      mockPredict.mockResolvedValue({ result: 'POSITIVE' });

      const result = await submitImage(validInput);

      // An upload is not a chat turn, so nothing else would run the state
      // machine — without this call the session stays parked in AWAITING_IMAGE.
      // The analysis succeeded, so the photo turn ends without a question of its
      // own and the perception question can be delivered with it.
      expect(mockAdvancePhase).toHaveBeenCalledWith(SESSION_ID, { suppressFollowUp: false });
      expect(result.phase).toBe('ASKING_PERCEPTION');
    });

    it('records the attempt count and confidence on the image row', async () => {
      arrangeNewSubmission();
      mockPredict.mockResolvedValue({ result: 'NEGATIVE', confidence: 12 });

      await submitImage(validInput);

      expect(mockImageUpdate).toHaveBeenCalledWith({
        where: { id: IMAGE_ID },
        data: {
          visualResult: 'NEGATIVE',
          predictionFailed: false,
          attemptCount: 1,
          confidenceScore: 12,
        },
      });
    });

    it('calls the vision API exactly once', async () => {
      arrangeNewSubmission();
      mockPredict.mockResolvedValue({ result: 'NEGATIVE' });

      await submitImage(validInput);

      expect(mockPredict).toHaveBeenCalledTimes(1);
    });

    it('persists the raw upstream payload when the API returns one', async () => {
      arrangeNewSubmission();
      mockPredict.mockResolvedValue({
        result: 'POSITIVE',
        rawResult: { model: 'v3', score: 0.9 },
      });

      await submitImage(validInput);

      expect(mockImageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rawResult: { model: 'v3', score: 0.9 } }),
        }),
      );
    });
  });

  describe('storage not configured', () => {
    it('skips the upload and leaves storagePath null when storage is unconfigured', async () => {
      arrangeNewSubmission();
      mockIsStorageConfigured.mockReturnValue(false);
      mockPredict.mockResolvedValue({ result: 'POSITIVE' });

      const result = await submitImage(validInput);

      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockImageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storagePath: null }),
        }),
      );
      // Analysis and phase progression proceed regardless of storage — the
      // vision API is the only hard v2 dependency.
      expect(result.visualResult).toBe('POSITIVE');
      expect(result.phase).toBe('ASKING_PERCEPTION');
    });

    it('still runs the vision prediction when storage is unconfigured', async () => {
      arrangeNewSubmission();
      mockIsStorageConfigured.mockReturnValue(false);
      mockPredict.mockResolvedValue({ result: 'NEGATIVE' });

      await submitImage(validInput);

      expect(mockPredict).toHaveBeenCalledTimes(1);
    });

    it('uploads when storage is configured, for contrast with the skip path above', async () => {
      arrangeNewSubmission();
      mockIsStorageConfigured.mockReturnValue(true);
      mockPredict.mockResolvedValue({ result: 'POSITIVE' });

      await submitImage(validInput);

      expect(mockUpload).toHaveBeenCalledWith(SESSION_ID, validInput.fileBuffer, 'image/jpeg');
      expect(mockImageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storagePath: `${SESSION_ID}/123.jpg` }),
        }),
      );
    });
  });

  describe('retry behaviour', () => {
    it('makes a single server-side attempt and reports predictionFailed on failure', async () => {
      // Server-side retries were removed: the client drives retries by tapping
      // the retry button. A single failure is enough to set predictionFailed.
      arrangeNewSubmission();
      mockPredict.mockRejectedValueOnce(new Error('timeout'));

      const result = await submitImage(validInput);

      expect(mockPredict).toHaveBeenCalledTimes(1);
      expect(result.predictionFailed).toBe(true);
      expect(result.visualResult).toBe('NEGATIVE');
    });

    it('records one attempt in the image row on failure', async () => {
      arrangeNewSubmission();
      mockPredict.mockRejectedValue(new Error('unreachable'));

      await submitImage(validInput);

      expect(mockPredict).toHaveBeenCalledTimes(1);
    });
  });

  describe('permanent failure fallback', () => {
    it('falls back to NEGATIVE and flags the failure so the gate still resolves', async () => {
      arrangeNewSubmission();
      mockPredict.mockRejectedValue(new Error('unreachable'));

      const result = await submitImage(validInput);

      expect(result.visualResult).toBe('NEGATIVE');
      expect(result.predictionFailed).toBe(true);
    });

    it('flags the failure on both the image and the result rows', async () => {
      arrangeNewSubmission();
      mockPredict.mockRejectedValue(new Error('unreachable'));

      await submitImage(validInput);

      expect(mockImageUpdate).toHaveBeenCalledWith({
        where: { id: IMAGE_ID },
        data: {
          visualResult: 'NEGATIVE',
          predictionFailed: true,
          attemptCount: 1,
          confidenceScore: null,
        },
      });

      expect(mockResultUpdate).toHaveBeenCalledWith({
        where: { id: 'result-1' },
        data: {
          visualResult: 'NEGATIVE',
          visualPredictionFailed: true,
          finalOutput: 'NOT_SCABIES',
        },
      });
    });

    it('still produces SUSPECTED_SCABIES on fallback when chat risk is HIGH', async () => {
      arrangeNewSubmission('HIGH');
      mockPredict.mockRejectedValue(new Error('unreachable'));

      const result = await submitImage(validInput);

      expect(result.finalOutput).toBe('SUSPECTED_SCABIES');
    });

    it('still leaves the gate, because the fallback counts as resolved', async () => {
      arrangeNewSubmission();
      mockPredict.mockRejectedValue(new Error('unreachable'));

      const result = await submitImage(validInput);

      // The failure copy ends in "Siap lanjut?", so the perception question is
      // held back rather than stacked behind it.
      expect(mockAdvancePhase).toHaveBeenCalledWith(SESSION_ID, { suppressFollowUp: true });
      expect(result.phase).toBe('ASKING_PERCEPTION');
    });
  });

  describe('result combination', () => {
    it.each([
      ['HIGH', 'NEGATIVE', 'SUSPECTED_SCABIES'],
      ['MODERATE', 'POSITIVE', 'SUSPECTED_SCABIES'],
      ['MODERATE', 'NEGATIVE', 'NOT_SCABIES'],
      ['LOW', 'POSITIVE', 'NOT_SCABIES'],
      ['LOW', 'NEGATIVE', 'NOT_SCABIES'],
    ] as const)('combines %s risk with %s visual into %s', async (risk, visual, expected) => {
      arrangeNewSubmission(risk);
      mockPredict.mockResolvedValue({ result: visual });

      const result = await submitImage(validInput);

      expect(result.finalOutput).toBe(expected);
    });

    it('resolves the gate without a final output when the session has no result row', async () => {
      arrangeNewSubmission();
      mockResultFind.mockResolvedValue(null as never);
      mockPredict.mockResolvedValue({ result: 'POSITIVE' });

      const result = await submitImage(validInput);

      expect(result.visualResult).toBe('POSITIVE');
      expect(result.finalOutput).toBeNull();
      expect(mockResultUpdate).not.toHaveBeenCalled();
    });
  });

  describe('duplicate submission', () => {
    it('replays the stored outcome without re-uploading or re-calling the API', async () => {
      mockSession.mockResolvedValue({ id: SESSION_ID, phase: 'ASKING_PERCEPTION' } as never);
      mockImageFind.mockResolvedValue({
        id: IMAGE_ID,
        visualResult: 'POSITIVE',
        predictionFailed: false,
      } as never);
      mockResultFind.mockResolvedValue({ finalOutput: 'SUSPECTED_SCABIES' } as never);

      const result = await submitImage(validInput);

      expect(result).toEqual({
        imageId: IMAGE_ID,
        botMessage: expect.stringContaining('berhasil dianalisis'),
        // The first submission already moved the phase and asked the question it
        // owed; replaying must not ask it a second time.
        followUpMessage: null,
        phase: 'ASKING_PERCEPTION',
        visualResult: 'POSITIVE',
        predictionFailed: false,
        finalOutput: 'SUSPECTED_SCABIES',
      });
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockPredict).not.toHaveBeenCalled();
      expect(mockImageCreate).not.toHaveBeenCalled();
      expect(mockAdvancePhase).not.toHaveBeenCalled();
    });

    it('resumes prediction on an existing row that never got a visual result', async () => {
      mockSession.mockResolvedValue({ id: SESSION_ID, phase: 'AWAITING_IMAGE' } as never);
      mockAdvancePhase.mockResolvedValue({
        phase: 'ASKING_PERCEPTION',
        followUpMessage: PERCEPTION_QUESTION,
      });
      mockImageFind.mockResolvedValue({
        id: IMAGE_ID,
        visualResult: null,
        predictionFailed: false,
      } as never);
      mockImageUpdate.mockResolvedValue({ id: IMAGE_ID } as never);
      mockResultFind.mockResolvedValue({ id: 'result-1', riskLevel: 'LOW' } as never);
      mockResultUpdate.mockResolvedValue({ id: 'result-1' } as never);
      mockPredict.mockResolvedValue({ result: 'POSITIVE' });

      const result = await submitImage(validInput);

      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockImageCreate).not.toHaveBeenCalled();
      expect(mockPredict).toHaveBeenCalledTimes(1);
      expect(result.visualResult).toBe('POSITIVE');
    });
  });
});

describe('getImageGateStatus', () => {
  it('reports unresolved when no image has been submitted', async () => {
    mockImageFind.mockResolvedValue(null as never);

    await expect(getImageGateStatus(SESSION_ID)).resolves.toEqual({
      resolved: false,
      visualResult: null,
      predictionFailed: false,
    });
  });

  it('reports unresolved while a submitted image has no visual result yet', async () => {
    mockImageFind.mockResolvedValue({ visualResult: null, predictionFailed: false } as never);

    const status = await getImageGateStatus(SESSION_ID);

    expect(status.resolved).toBe(false);
  });

  it('reports resolved once a visual result is recorded', async () => {
    mockImageFind.mockResolvedValue({ visualResult: 'POSITIVE', predictionFailed: false } as never);

    await expect(getImageGateStatus(SESSION_ID)).resolves.toEqual({
      resolved: true,
      visualResult: 'POSITIVE',
      predictionFailed: false,
    });
  });

  it('reports resolved for the permanent-failure fallback', async () => {
    mockImageFind.mockResolvedValue({ visualResult: 'NEGATIVE', predictionFailed: true } as never);

    await expect(getImageGateStatus(SESSION_ID)).resolves.toEqual({
      resolved: true,
      visualResult: 'NEGATIVE',
      predictionFailed: true,
    });
  });
});

/**
 * The photo has to exist in the durable transcript, not just as a blob URL in
 * the browser, otherwise it has no position in the conversation and vanishes on
 * refresh while the bot messages describing it survive.
 */
describe('submitImage — transcript recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Pull the `data` payloads out of the two creates handed to $transaction. */
  function recordedMessages(): Array<Record<string, unknown>> {
    return mockChatMessageCreate.mock.calls.map(
      (call) => (call[0] as { data: Record<string, unknown> }).data,
    );
  }

  it('records the photo as a user turn marked IMAGE', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    const [imageTurn] = recordedMessages();
    expect(imageTurn).toMatchObject({
      sessionId: SESSION_ID,
      role: 'user',
      kind: 'IMAGE',
    });
  });

  it('gives the image turn readable content, because the LLM context reads it', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    const [imageTurn] = recordedMessages();
    // Not a sentinel like "__IMAGE__": loadRecentMessages() feeds `content`
    // straight to the model, and unknown readers must degrade to plain text.
    expect(imageTurn?.content).toBe('Santri mengirim satu foto area kulit yang gatal.');
  });

  it('follows the image turn with a bot acknowledgement on success', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    const [, botTurn] = recordedMessages();
    expect(botTurn).toMatchObject({ role: 'assistant' });
    expect(botTurn?.content).toContain('berhasil dianalisis');
  });

  it('tells the santri the chat analysis will be used when prediction failed', async () => {
    arrangeNewSubmission();
    mockPredict.mockRejectedValue(new Error('unreachable'));

    await submitImage(validInput);

    const [, botTurn] = recordedMessages();
    expect(botTurn?.content).toContain('belum berhasil aku analisis');
    expect(botTurn?.content).toContain('obrolan kita');
  });

  it('never states the POSITIVE/NEGATIVE verdict in chat', async () => {
    arrangeNewSubmission('HIGH');
    mockPredict.mockResolvedValue({ result: 'NEGATIVE' });

    await submitImage(validInput);

    // A NEGATIVE photo at HIGH chat risk still combines to SUSPECTED_SCABIES,
    // so a verdict here would contradict the result page.
    const contents = recordedMessages().map((m) => String(m.content));
    for (const content of contents) {
      expect(content).not.toMatch(/POSITIVE|NEGATIVE|Positif|Negatif/i);
      expect(content).not.toMatch(/SUSPECTED_SCABIES|Suspek/i);
    }
  });

  it('asks the question the next phase owes as a third row', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    // No chat turn follows an upload, so without this row the santri would sit
    // in ASKING_PERCEPTION facing a phase that never spoke.
    const [, , followUp] = recordedMessages();
    expect(followUp).toMatchObject({ role: 'assistant' });
    expect(followUp?.content).toBe(PERCEPTION_QUESTION);
  });

  it('records only the two rows when the phase owes no question', async () => {
    arrangeNewSubmission();
    mockAdvancePhase.mockResolvedValue({ phase: 'AWAITING_IMAGE', followUpMessage: null });
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    expect(mockChatMessageCreate).toHaveBeenCalledTimes(2);
  });

  it('orders the rows with explicit timestamps', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    const [imageTurn, botTurn, followUp] = recordedMessages();
    const imageAt = (imageTurn?.createdAt as Date).getTime();
    const botAt = (botTurn?.createdAt as Date).getTime();
    const followUpAt = (followUp?.createdAt as Date).getTime();

    // Inside a transaction Postgres' now() is identical for every row, so the
    // column default would leave orderBy free to shuffle them.
    expect(botAt).toBeGreaterThan(imageAt);
    expect(followUpAt).toBeGreaterThan(botAt);
  });

  it('writes every row in one transaction', async () => {
    arrangeNewSubmission();
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockChatMessageCreate).toHaveBeenCalledTimes(3);
  });

  it('uses English copy for an English session', async () => {
    arrangeNewSubmission();
    mockSession.mockResolvedValue({
      id: SESSION_ID,
      locale: 'en',
      phase: 'AWAITING_IMAGE',
    } as never);
    mockPredict.mockResolvedValue({ result: 'POSITIVE' });

    await submitImage(validInput);

    const [imageTurn] = recordedMessages();
    expect(imageTurn?.content).toBe('The santri submitted a photo of the itchy skin area.');
  });

  it('does not record a second image turn for a duplicate submission', async () => {
    mockSession.mockResolvedValue({
      id: SESSION_ID,
      locale: 'id',
      phase: 'ASKING_PERCEPTION',
    } as never);
    mockImageFind.mockResolvedValue({
      id: IMAGE_ID,
      visualResult: 'POSITIVE',
      predictionFailed: false,
    } as never);
    mockResultFind.mockResolvedValue({ finalOutput: 'SUSPECTED_SCABIES' } as never);

    await submitImage(validInput);

    expect(mockChatMessageCreate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('does not record followUpMessage when predictionFailed is true', async () => {
    // When prediction fails, botMessage ends with "Siap lanjut?" which expects
    // user confirmation. The perception question comes from chat.service after
    // the user responds, so the gate is asked to hold it back — which also stops
    // the session recording it as asked.
    arrangeNewSubmission();
    mockPredict.mockRejectedValueOnce(new Error('timeout'));

    await submitImage(validInput);

    // Only 2 messages: image turn + bot message (no followUpMessage)
    expect(mockChatMessageCreate).toHaveBeenCalledTimes(2);
    const messages = recordedMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    // Verify no third message with perception question
    expect(messages[2]).toBeUndefined();
  });
});
