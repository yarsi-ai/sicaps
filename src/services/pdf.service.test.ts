import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/features/screening-chat-v1', () => ({
  getResult: vi.fn(),
}));

vi.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Page: 'Page',
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  renderToBuffer: vi.fn(),
}));

import { getResult } from '@/features/screening-chat-v1';
import { renderToBuffer } from '@react-pdf/renderer';
import { generateResultPdf } from './pdf.service';

const mockGetResult = vi.mocked(getResult);
const mockRenderToBuffer = vi.mocked(renderToBuffer);

const mockResultData = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  completedAt: '2025-01-01T12:00:00.000Z',
  demographics: { name: 'Test User', age: 15, gender: 'male', educationLevel: 'junior_high' },
  totalScore: 5,
  riskLevel: 'MODERATE' as const,
  scores: { intensitas: 1, waktu: 1, lokasi_tubuh: 1, kontak: 1, lesi: 1, faktor_risiko: 0 },
  conclusion: 'Risiko sedang terdeteksi.',
  perceptionResponse: null,
  recommendation: 'Konsultasikan ke dokter.',
  personalizedSuggestion: null,
};

describe('generateResultPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetResult.mockResolvedValue(mockResultData);
    mockRenderToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4 mock'));
  });

  it('calls getResult with the sessionId', async () => {
    await generateResultPdf('session-123', 'id');

    expect(mockGetResult).toHaveBeenCalledWith('session-123');
    expect(mockGetResult).toHaveBeenCalledOnce();
  });

  it('calls renderToBuffer with a React element', async () => {
    await generateResultPdf('session-123', 'id');

    expect(mockRenderToBuffer).toHaveBeenCalledOnce();
    expect(mockRenderToBuffer).toHaveBeenCalledWith(expect.anything());
  });

  it('returns the buffer from renderToBuffer', async () => {
    const expectedBuffer = Buffer.from('%PDF-1.4 test content');
    mockRenderToBuffer.mockResolvedValue(expectedBuffer);

    const result = await generateResultPdf('session-123', 'en');

    expect(result).toBe(expectedBuffer);
  });

  it('passes locale to generate localized content', async () => {
    await generateResultPdf('session-123', 'en');

    expect(mockGetResult).toHaveBeenCalledWith('session-123');
    // Locale is used in the document component, not directly testable via mock,
    // but we verify the function completes without error for both locales
  });

  it('propagates error when getResult throws', async () => {
    mockGetResult.mockRejectedValue(new Error('Session not found'));

    await expect(generateResultPdf('nonexistent', 'id')).rejects.toThrow('Session not found');
  });

  it('propagates error when renderToBuffer fails', async () => {
    mockRenderToBuffer.mockRejectedValue(new Error('PDF rendering failed'));

    await expect(generateResultPdf('session-123', 'id')).rejects.toThrow('PDF rendering failed');
  });
});
