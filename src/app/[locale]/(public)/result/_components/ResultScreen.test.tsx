import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultScreen from './ResultScreen';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      hasil: {
        notFound: 'Result not found',
        home: 'Home',
        retry: 'Retry',
        rateLimited: 'Too many requests. Please try again.',
        'visualDetection.title': 'Deteksi Visual',
        'visualDetection.positive': 'Positif terdeteksi',
        'visualDetection.negative': 'Negatif',
        'visualDetection.fallback': 'Foto tidak dapat dianalisis',
        'visualDetection.finalSuspected': 'Suspek Skabies',
        'visualDetection.finalNotScabies': 'Tidak Skabies',
        analyzing: 'Menganalisis...',
        analyzingHint: 'Mohon tunggu',
        summary: 'Kesimpulan',
        forYou: 'Untuk Kamu',
        todo: 'Yang Perlu Dilakukan',
        advice: 'Saran',
        disclaimer: 'Disclaimer text',
        detailShow: 'Show detail',
        detailHide: 'Hide detail',
        newScreening: 'Skrining Baru',
        nudgeTitle: 'Save your result',
        nudgeBody: 'Login to save',
        gejalaDetected: '{count} gejala',
        finalOutputSuspected: 'Suspek Skabies',
        finalOutputNotScabies: 'Tidak Skabies',
        finalOutputSubChat: 'Chat: {risk}',
        finalOutputSubVisual: 'Foto: {result}',
        finalOutputVisualPositive: 'tanda terdeteksi',
        finalOutputVisualNegative: 'tidak ada tanda',
        finalOutputVisualFallback: 'foto tidak terbaca',
        'fallback.conclusion.HIGH': 'High risk conclusion',
        'fallback.conclusion.MODERATE': 'Moderate risk conclusion',
        'fallback.conclusion.LOW': 'Low risk conclusion',
        'fallback.perception.HIGH': 'High risk perception',
        'fallback.perception.MODERATE': 'Moderate risk perception',
        'fallback.perception.LOW': 'Low risk perception',
        'fallback.recommendation.HIGH': 'High risk recommendation',
        'fallback.recommendation.MODERATE': 'Moderate risk recommendation',
        'fallback.recommendation.LOW': 'Low risk recommendation',
        'fallback.suggestion.HIGH': 'High risk suggestion',
        'fallback.suggestion.MODERATE': 'Moderate risk suggestion',
        'fallback.suggestion.LOW': 'Low risk suggestion',
        detailTitle: 'Detail Gejala',
        detailGejala: 'Gejala',
        detailGatalMalam: 'Gatal Malam',
        detailKontak: 'Kontak Serupa',
        detailLokasi: 'Lokasi Khas',
        detailFaktor: 'Faktor Risiko',
        detailAsrama: 'Asrama',
        detailTukarAlat: 'Tukar Alat',
        detailNote: 'Detail note',
        detailVisualTitle: 'Deteksi Visual',
        detailVisualPositive: 'Tanda visual terdeteksi',
        detailVisualNegative: 'Tidak ada tanda visual',
        detailVisualFallback: 'Analisis foto tidak tersedia',
      },
      common: {
        back: 'Back',
        login: 'Login',
        notNow: 'Not now',
        loginComingSoon: 'Login coming soon',
        riskTinggi: 'Risiko Tinggi',
        riskSedang: 'Risiko Sedang',
        riskRendah: 'Risiko Rendah',
      },
    };
    return translations[namespace]?.[key] ?? key;
  },
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useParams: () => ({ locale: 'id' }),
}));

// Mock i18n navigation
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => '/result',
}));

// Mock i18n routing
vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['id', 'en'],
    defaultLocale: 'id',
  },
}));

// Mock useLocaleSession
vi.mock('@/hooks/useLocaleSession', () => ({
  useLocaleSession: () => ({
    saveLocale: vi.fn(),
  }),
}));

// Mock Toast
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

// Mock ScreeningProvider
const mockUseScreening = vi.fn();
vi.mock('../../_components/ScreeningProvider', () => ({
  useScreening: () => mockUseScreening(),
}));

// Mock CONFIG
vi.mock('@/lib/config', () => ({
  CONFIG: {
    resultPolling: {
      INTERVAL_MS: 2000,
      MAX_ATTEMPTS: 10,
    },
  },
  SCREENING_CHAT_VERSION: 'v2',
}));

describe('ResultScreen', () => {
  // Counter to generate unique session IDs to avoid resultCache interference
  let testCounter = 0;

  /**
   * Wrap payload data in a complete API envelope.
   *
   * The gate check validates the whole envelope with Zod, so a partial mock is
   * rejected and the component falls open instead of exercising the path under
   * test. Mocks must therefore be shaped exactly like the real response.
   */
  const envelope = (data: unknown) => ({
    data,
    error: null,
    meta: { timestamp: '2026-08-11T00:00:00.000Z', requestId: 'req-test' },
  });

  /** Gate status payload as returned by GET /api/screening/image/[sessionId]. */
  const gateStatus = (resolved: boolean) =>
    envelope({ resolved, visualResult: resolved ? 'NEGATIVE' : null, predictionFailed: false });

  // Helper to create a mock fetch that handles multiple calls
  const createMockFetch = (
    responses: Array<{ url: string; response: unknown; status?: number }>,
  ) => {
    return vi.fn().mockImplementation((url: string) => {
      const match = responses.find((r) => url.includes(r.url));
      if (match) {
        return Promise.resolve({
          ok: (match.status ?? 200) < 400,
          status: match.status ?? 200,
          json: () => Promise.resolve(match.response),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    testCounter++;
    // Reset search params
    mockSearchParams.delete('session');
    mockSearchParams.delete('token');
    mockSearchParams.delete('fresh');
    // Default: image gate resolved
    mockUseScreening.mockReturnValue({
      imageGateResolved: true,
      reset: vi.fn(),
    });
    // Default fetch mock that returns 404 - tests will override as needed
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('gate check behavior', () => {
    /**
     * Validates: Requirements 2.1
     * IF a santri attempts to navigate to the result page for a session AND
     * the Image_Upload_Gate for that session has not been resolved, THEN THE
     * Visual_Detection_Feature SHALL prevent navigation to the result page
     */
    it('redirects to /chat when image gate is unresolved (Req 2.1)', async () => {
      mockSearchParams.set('session', `gate-session-${testCounter}-1`);
      mockSearchParams.set('token', `gate-token-${testCounter}-1`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: false,
        reset: vi.fn(),
      });

      // Mock the gate check API response as unresolved
      global.fetch = createMockFetch([
        { url: '/api/screening/image/', response: gateStatus(false) },
        { url: '/api/screening/result/', response: { data: null } },
        { url: '/transcript', response: { data: { messages: [] } } },
      ]);

      render(<ResultScreen />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/chat');
      });
    });

    it('allows result page access when gate is resolved from context', async () => {
      mockSearchParams.set('session', `gate-session-${testCounter}-2`);
      mockSearchParams.set('token', `gate-token-${testCounter}-2`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createMockFetch([
        {
          url: '/api/screening/result/',
          response: {
            data: {
              riskLevel: 'HIGH',
              edukasi: [],
              gejalaCount: 2,
              faktorCount: 1,
              scoringState: {},
              aiConclusion: 'Test conclusion gate',
              aiPerceptionResponse: 'Test perception',
              aiRecommendation: 'Test recommendation',
              aiSuggestion: 'Test suggestion',
            },
          },
        },
        { url: '/transcript', response: { data: { messages: [] } } },
      ]);

      render(<ResultScreen />);

      // Should NOT redirect
      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalledWith('/chat');
      });

      // Should show result content
      await waitFor(() => {
        expect(screen.getByText('Test conclusion gate')).toBeInTheDocument();
      });
    });

    it('checks API for gate status when context shows unresolved', async () => {
      const sessionId = `gate-session-${testCounter}-3`;
      mockSearchParams.set('session', sessionId);
      mockSearchParams.set('token', `gate-token-${testCounter}-3`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: false,
        reset: vi.fn(),
      });

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/screening/image/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(gateStatus(true)),
          });
        }
        if (url.includes('/api/screening/result/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: {
                  riskLevel: 'LOW',
                  edukasi: [],
                  gejalaCount: 0,
                  faktorCount: 0,
                  scoringState: {},
                  aiConclusion: 'Low risk gate',
                },
              }),
          });
        }
        if (url.includes('/transcript')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { messages: [] } }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'Not found' }),
        });
      });
      global.fetch = mockFetch;

      render(<ResultScreen />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/screening/image/'));
      });

      // Regression guard: the client used to read a `resolved` field the server
      // never sent, so every direct/refresh visit bounced back to /chat.
      await waitFor(() => {
        expect(screen.getByText('Low risk gate')).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalledWith('/chat');
    });

    it('redirects to /chat when no image record exists for the session', async () => {
      mockSearchParams.set('session', `gate-session-${testCounter}-5`);
      mockSearchParams.set('token', `gate-token-${testCounter}-5`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: false,
        reset: vi.fn(),
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/screening/image/')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: 'Not found' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { messages: [] } }),
        });
      });

      render(<ResultScreen />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/chat');
      });
    });

    it('shows loading state while gate check is pending', () => {
      mockSearchParams.set('session', `gate-session-${testCounter}-4`);
      mockSearchParams.set('token', `gate-token-${testCounter}-4`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: false,
        reset: vi.fn(),
      });

      // Don't resolve the fetch immediately
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const { container } = render(<ResultScreen />);

      // Should show loading indicator (ellipsis)
      expect(container.textContent).toContain('…');
    });
  });

  describe('visual detection card display', () => {
    const createResultMock = (resultOverrides: Record<string, unknown> = {}) => {
      const defaultResult = {
        riskLevel: 'MODERATE',
        edukasi: [], // This makes it a V2 result
        gejalaCount: 2,
        faktorCount: 1,
        scoringState: {},
        aiConclusion: 'Test conclusion',
        aiPerceptionResponse: 'Test perception',
        aiRecommendation: 'Test recommendation',
        aiSuggestion: 'Test suggestion',
        visualResult: null,
        finalOutput: null,
        visualPredictionFailed: false,
        ...resultOverrides,
      };

      return createMockFetch([
        { url: '/api/screening/result/', response: { data: defaultResult } },
        { url: '/transcript', response: { data: { messages: [] } } },
      ]);
    };

    /**
     * Validates: Requirements 11.1
     * WHEN the result page renders a completed session, THE Visual_Detection_Feature
     * SHALL display the Final_Output alongside the existing chat-based result content
     * The finalOutput is now shown in the hero chip and in the detail panel.
     */
    it('displays Final_Output in the hero chip (Req 11.1)', async () => {
      mockSearchParams.set('session', `visual-session-${testCounter}-1`);
      mockSearchParams.set('token', `visual-token-${testCounter}-1`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'POSITIVE',
        finalOutput: 'SUSPECTED_SCABIES',
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      // finalOutput shown in the hero chip
      await waitFor(() => {
        expect(screen.getByText('Suspek Skabies')).toBeInTheDocument();
      });
    });

    /**
     * Validates: Requirements 11.2
     * WHEN the result page renders a completed session AND `visualPredictionFailed`
     * is false, THE Visual_Detection_Feature SHALL display the Visual_Result.
     * Visual result is now inside the Detail Penilaian collapsible section.
     */
    it('displays Visual_Result when detail panel is open (Req 11.2)', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-2`);
      mockSearchParams.set('token', `visual-token-${testCounter}-2`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'POSITIVE',
        finalOutput: 'SUSPECTED_SCABIES',
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      // Open detail panel first
      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Tanda visual terdeteksi')).toBeInTheDocument();
      });
    });

    it('displays NEGATIVE visual result correctly', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-3`);
      mockSearchParams.set('token', `visual-token-${testCounter}-3`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'NEGATIVE',
        finalOutput: 'NOT_SCABIES',
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      // Open detail panel
      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Tidak ada tanda visual')).toBeInTheDocument();
      });

      // finalOutput shown in hero
      expect(screen.getByText('Tidak Skabies')).toBeInTheDocument();
    });

    /**
     * Validates: Requirements 11.3, 8.3
     */
    it('displays disclaimer when visualPredictionFailed is true (Req 11.3, 8.3)', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-4`);
      mockSearchParams.set('token', `visual-token-${testCounter}-4`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'NEGATIVE',
        finalOutput: 'NOT_SCABIES',
        visualPredictionFailed: true,
      });

      render(<ResultScreen />);

      // Open detail panel
      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Analisis foto tidak tersedia')).toBeInTheDocument();
      });

      // Should NOT show the positive/negative label
      expect(screen.queryByText('Tanda visual terdeteksi')).not.toBeInTheDocument();
      expect(screen.queryByText('Tidak ada tanda visual')).not.toBeInTheDocument();
    });

    it('does not render visual detection card when no visual result', async () => {
      mockSearchParams.set('session', `visual-session-${testCounter}-5`);
      mockSearchParams.set('token', `visual-token-${testCounter}-5`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: null,
        finalOutput: null,
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      await waitFor(() => {
        expect(screen.getByText('Test conclusion')).toBeInTheDocument();
      });

      // Visual detection card should not be rendered
      expect(screen.queryByText('Deteksi Visual')).not.toBeInTheDocument();
    });

    it('renders visual detection card with proper styling for POSITIVE result', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-6`);
      mockSearchParams.set('token', `visual-token-${testCounter}-6`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'POSITIVE',
        finalOutput: 'SUSPECTED_SCABIES',
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Tanda visual terdeteksi')).toBeInTheDocument();
      });

      // POSITIVE uses filled dot (●), same pattern as Gejala Kunci
      const dots = screen.getAllByText('●');
      expect(dots.length).toBeGreaterThan(0);
    });

    it('renders visual detection card with proper styling for NEGATIVE result', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-7`);
      mockSearchParams.set('token', `visual-token-${testCounter}-7`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'NEGATIVE',
        finalOutput: 'NOT_SCABIES',
        visualPredictionFailed: false,
      });

      render(<ResultScreen />);

      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Tidak ada tanda visual')).toBeInTheDocument();
      });

      // NEGATIVE still uses filled dot (●) — no sign detected is still a result
      const dots = screen.getAllByText('●');
      expect(dots.length).toBeGreaterThan(0);
    });

    it('renders visual detection card with question mark for failed prediction', async () => {
      const user = userEvent.setup();
      mockSearchParams.set('session', `visual-session-${testCounter}-8`);
      mockSearchParams.set('token', `visual-token-${testCounter}-8`);
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      global.fetch = createResultMock({
        visualResult: 'NEGATIVE',
        finalOutput: 'NOT_SCABIES',
        visualPredictionFailed: true,
      });

      render(<ResultScreen />);

      await waitFor(() => screen.getByText('Show detail'));
      await user.click(screen.getByText('Show detail'));

      await waitFor(() => {
        expect(screen.getByText('Analisis foto tidak tersedia')).toBeInTheDocument();
      });

      // Failed prediction uses hollow dot (○), same as unfulfilled Gejala Kunci
      const hollowDots = screen.getAllByText('○');
      expect(hollowDots.length).toBeGreaterThan(0);
    });
  });

  describe('not found handling', () => {
    it('shows not found when session is missing', () => {
      mockSearchParams.delete('session');
      mockSearchParams.set('token', 'test-token');
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      render(<ResultScreen />);

      expect(screen.getByText('Result not found')).toBeInTheDocument();
    });

    it('shows not found when token is missing', () => {
      mockSearchParams.set('session', 'test-session-id');
      mockSearchParams.delete('token');
      mockUseScreening.mockReturnValue({
        imageGateResolved: true,
        reset: vi.fn(),
      });

      render(<ResultScreen />);

      expect(screen.getByText('Result not found')).toBeInTheDocument();
    });
  });
});
