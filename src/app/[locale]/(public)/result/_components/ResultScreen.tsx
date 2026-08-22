'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import AppFooter from '@/components/ui/AppFooter';
import BackButton from '@/components/ui/BackButton';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import RiskChip from '@/components/ui/RiskChip';
import SparkleDecoration from '@/components/ui/SparkleDecoration';
import { CheckSquareIcon, CloudSaveIcon, XIcon } from '@/components/icons';
import { useToast } from '@/components/ui/Toast';
import { useScreening } from '../../_components/ScreeningProvider';
import type { ResultResponse, ResultResponseV2 } from '@/types/screening-ui-api';
import { CONFIG, SCREENING_CHAT_VERSION } from '@/lib/config';
import { imageGateStatusEnvelopeSchema } from '@/lib/vision';

/** Production API result envelope shape */
interface ApiResultData {
  sessionId: string;
  completedAt: string;
  demographics: { name: string | null; age: number; gender: string; educationLevel: string };
  totalScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  scores: Record<string, number>;
  conclusion: string;
  perceptionResponse: string | null;
  recommendation: string;
  personalizedSuggestion: string | null;
}

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { timestamp: string; requestId: string };
}

/** Production API transcript shape */
interface TranscriptMessage {
  role: 'bot' | 'user';
  content: string;
  createdAt: string;
  isVoice: boolean;
}

/** Module-level cache so locale-switch remounts don't refetch — keyed by session+token.
 *  Result content is locale-independent (AI text was generated once using the session's
 *  locale at analysis time; UI-language switching only changes surrounding chrome text). */
const resultCache = new Map<
  string,
  { apiResult: ApiResultData | ResultResponseV2; transcriptMessages: TranscriptMessage[] }
>();

function cacheKey(sessionId: string, token: string): string {
  return `${sessionId}:${token}`;
}

/** Map production riskLevel to frontend RiskKey */
function mapRiskLevel(riskLevel: string): ResultResponse['level'] {
  const map: Record<string, ResultResponse['level']> = {
    HIGH: 'tinggi',
    MODERATE: 'sedang',
    LOW: 'rendah',
  };
  return map[riskLevel] ?? 'rendah';
}

/** Map frontend level to i18n risk key for fallback lookup */
function getRiskKey(level: string): 'HIGH' | 'MODERATE' | 'LOW' {
  const map: Record<string, 'HIGH' | 'MODERATE' | 'LOW'> = {
    tinggi: 'HIGH',
    sedang: 'MODERATE',
    rendah: 'LOW',
  };
  return map[level] ?? 'LOW';
}

/** Internal result shape for the result screen */
interface ResultWithRevision extends ResultResponse {
  isV2?: boolean;
  gejalaCount?: number;
  faktorCount?: number;
  scoringState?: Record<string, boolean>;
  /** Visual detection result (POSITIVE/NEGATIVE) from image analysis */
  visualResult?: 'POSITIVE' | 'NEGATIVE' | null;
  /** Combined final output from chat risk + visual detection */
  finalOutput?: 'SUSPECTED_SCABIES' | 'NOT_SCABIES' | null;
  /** Whether visual prediction failed after exhausting retries */
  visualPredictionFailed?: boolean;
}

/** Map production API result to frontend ResultResponse */
function mapToResultResponse(
  apiResult: ApiResultData,
  transcript: TranscriptMessage[],
): ResultWithRevision {
  return {
    sessionId: apiResult.sessionId,
    shareToken: '', // Populated from URL params
    score: apiResult.totalScore,
    level: mapRiskLevel(apiResult.riskLevel),
    needsReview: false, // V1 compat — field exists in ResultResponse type but not displayed
    kesimpulan: apiResult.conclusion,
    persona: apiResult.perceptionResponse ?? '',
    aksi: apiResult.recommendation ? apiResult.recommendation.split('\n').filter(Boolean) : [],
    saran: apiResult.personalizedSuggestion ?? apiResult.recommendation ?? '',
    mode: 'ai',
    createdAt: apiResult.completedAt,
    transcript: transcript.map((m, idx) => ({
      id: `transcript-${idx}`,
      role: m.role,
      text: m.content,
      createdAt: m.createdAt,
    })),
  };
}

/** Map a raw API result (V2 or V1) + transcript into the internal result shape.
 *  Factored out so the cache-hit and cache-miss paths share the exact same mapping logic. */
function mapApiResultToResult(
  apiResult: ApiResultData | ResultResponseV2,
  transcriptMessages: TranscriptMessage[],
  sessionId: string,
  token: string,
): ResultWithRevision {
  if ('edukasi' in apiResult) {
    const v2 = apiResult;
    return {
      sessionId,
      shareToken: token,
      score: 0, // V2 has no numeric score
      level: mapRiskLevel(v2.riskLevel),
      needsReview: false, // V1 compat — field exists in ResultResponse type but not displayed
      kesimpulan: v2.aiConclusion ?? '',
      persona: v2.aiPerceptionResponse ?? '',
      // Left empty when the AI text is not ready so the render falls through to
      // the localized i18n fallback. Using the server `edukasi` list here made
      // this one card render in Indonesian while the other three cards used
      // their English i18n fallbacks.
      aksi: v2.aiRecommendation ? v2.aiRecommendation.split('\n').filter(Boolean) : [],
      saran: v2.aiSuggestion ?? '',
      mode: 'ai',
      createdAt: new Date().toISOString(),
      transcript: transcriptMessages.map((m, idx) => ({
        id: `transcript-${idx}`,
        role: m.role,
        text: m.content,
        createdAt: m.createdAt,
      })),
      // V2 specific
      isV2: true,
      gejalaCount: v2.gejalaCount,
      faktorCount: v2.faktorCount,
      scoringState: v2.scoringState,
      // Visual detection fields
      visualResult: v2.visualResult ?? null,
      finalOutput: v2.finalOutput ?? null,
      visualPredictionFailed: v2.visualPredictionFailed ?? false,
    };
  }

  const mapped = mapToResultResponse(apiResult, transcriptMessages);
  mapped.shareToken = token;
  return mapped;
}

export default function ResultScreen() {
  const t = useTranslations('hasil');
  const common = useTranslations('common');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { reset, imageGateResolved } = useScreening();

  const sessionId = searchParams.get('session');
  const token = searchParams.get('token');
  // Only a fresh completion (navigated straight from the chat) should trigger polling —
  // a history revisit lands on the same URL shape without this marker and must show the
  // result (or its static fallback) immediately, never the blocking "analyzing" screen.
  const isFreshCompletion = searchParams.get('fresh') === '1';

  const [result, setResult] = useState<ResultWithRevision | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isPollingAi, setIsPollingAi] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  /**
   * Cases where the gate needs no server round trip: v1 has no gate at all, a
   * missing session is handled by the notFound branch, and arriving straight
   * from the chat means the context already saw the result get recorded.
   */
  const gateSatisfiedLocally = SCREENING_CHAT_VERSION !== 'v2' || !sessionId || imageGateResolved;
  /** null = still asking the API. Unresolved redirects rather than rendering. */
  const [apiGateResolved, setApiGateResolved] = useState<boolean | null>(null);
  const gateCheckComplete = gateSatisfiedLocally ? true : apiGateResolved;
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingAttemptsRef = useRef(0);
  const notFound = !sessionId || !token || fetchFailed;

  /** Stop polling and clean up interval */
  function stopPolling(): void {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingAi(false);
  }

  /** Fetch V2 result and check if AI fields are ready */
  function pollForAiResult(sid: string, tok: string): void {
    fetch(`/api/screening/result/${sid}?token=${tok}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((envelope: ApiEnvelope<ResultResponseV2>) => {
        if (!envelope.data) return;
        const v2 = envelope.data;
        if (v2.aiConclusion !== null) {
          // AI fields are ready — update result and stop polling
          setResult((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              kesimpulan: v2.aiConclusion ?? '',
              persona: v2.aiPerceptionResponse ?? '',
              aksi: v2.aiRecommendation
                ? v2.aiRecommendation.split('\n').filter(Boolean)
                : prev.aksi,
              saran: v2.aiSuggestion ?? '',
            };
          });
          // Keep the cache in sync so a future remount reflects the completed AI text.
          const key = cacheKey(sid, tok);
          const cached = resultCache.get(key);
          if (cached && 'edukasi' in cached.apiResult) {
            resultCache.set(key, {
              ...cached,
              apiResult: {
                ...cached.apiResult,
                aiConclusion: v2.aiConclusion,
                aiPerceptionResponse: v2.aiPerceptionResponse,
                aiRecommendation: v2.aiRecommendation,
                aiSuggestion: v2.aiSuggestion,
              },
            });
          }
          stopPolling();
        } else {
          pollingAttemptsRef.current += 1;
          if (pollingAttemptsRef.current >= CONFIG.resultPolling.MAX_ATTEMPTS) {
            // Max attempts reached — stop polling, fallback will be handled by card rendering
            stopPolling();
          }
        }
      })
      .catch(() => {
        // On fetch error during polling, stop polling
        pollingAttemptsRef.current += 1;
        if (pollingAttemptsRef.current >= CONFIG.resultPolling.MAX_ATTEMPTS) {
          stopPolling();
        }
      });
  }

  /** Start polling for AI-generated fields */
  function startPolling(sid: string, tok: string): void {
    stopPolling(); // clear any pre-existing interval first — idempotent guard against double-start
    setIsPollingAi(true);
    pollingAttemptsRef.current = 0;
    pollingIntervalRef.current = setInterval(
      () => pollForAiResult(sid, tok),
      CONFIG.resultPolling.INTERVAL_MS,
    );
  }

  // Image gate check for v2 sessions reached without in-memory context (direct
  // URL, refresh, shared link). Error Scenario 5 depends on this path being
  // correct: a wrong read here bounces every v2 session straight back to /chat.
  useEffect(() => {
    if (gateSatisfiedLocally || !sessionId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/screening/image/${sessionId}`);

        // 404 means no image record at all — the gate cannot have resolved.
        if (res.status === 404) {
          if (!cancelled) router.push('/chat');
          return;
        }

        if (!res.ok) throw new Error('gate_check_failed');

        const envelope = imageGateStatusEnvelopeSchema.parse(await res.json());
        if (cancelled) return;

        if (envelope.data?.resolved === true) {
          setApiGateResolved(true);
        } else {
          router.push('/chat');
        }
      } catch {
        if (cancelled) return;
        // Fail open on transport or contract errors: a broken gate check should
        // not lock a santri out of a result that already exists.
        setApiGateResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, gateSatisfiedLocally, router]);

  useEffect(() => {
    if (!sessionId || !token) return;
    let cancelled = false;

    // Locale-switch remounts this component but shouldn't refetch data already in hand —
    // result content is locale-independent, so a cache hit can go straight to mapping.
    const cached = resultCache.get(cacheKey(sessionId, token));
    if (cached) {
      // Deferred (not called synchronously in the effect body) to keep this in line with
      // the fetch-based path below, which resolves asynchronously too.
      Promise.resolve().then(() => {
        if (cancelled) return;
        const mapped = mapApiResultToResult(
          cached.apiResult,
          cached.transcriptMessages,
          sessionId,
          token,
        );
        setResult(mapped);
        if (
          isFreshCompletion &&
          'edukasi' in cached.apiResult &&
          cached.apiResult.aiConclusion === null
        ) {
          startPolling(sessionId, token);
        }
      });
      return () => {
        cancelled = true;
        stopPolling();
      };
    }

    // Fetch result and transcript in parallel from production API
    const resultPromise = fetch(`/api/screening/result/${sessionId}?token=${token}`)
      .then((res) => {
        if (res.status === 429) {
          const err = new Error('rate_limited') as Error & { rateLimited: true };
          err.rateLimited = true;
          throw err;
        }
        return res.ok ? res.json() : Promise.reject(new Error('fetch_failed'));
      })
      .then((envelope: ApiEnvelope<ApiResultData | ResultResponseV2>) => {
        if (!envelope.data) throw new Error('no_data');
        return envelope.data;
      });

    const transcriptPromise = fetch(`/api/screening/${sessionId}/transcript?token=${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((envelope: ApiEnvelope<{ messages: TranscriptMessage[] }>) => {
        if (!envelope.data) return { messages: [] };
        return envelope.data;
      })
      .catch(() => ({ messages: [] as TranscriptMessage[] }));

    Promise.all([resultPromise, transcriptPromise])
      .then(([apiResult, transcriptData]) => {
        if (cancelled) return;
        resultCache.set(cacheKey(sessionId, token), {
          apiResult,
          transcriptMessages: transcriptData.messages,
        });
        const mapped = mapApiResultToResult(apiResult, transcriptData.messages, sessionId, token);
        setResult(mapped);

        // Detect V2 response (has edukasi field, no totalScore)
        if ('edukasi' in apiResult) {
          // Only poll for a fresh completion — history revisits show the fallback immediately
          // instead of re-triggering the "still analyzing" blocking screen.
          if (isFreshCompletion && apiResult.aiConclusion === null) {
            startPolling(sessionId, token);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && (err as Error & { rateLimited?: boolean }).rateLimited) {
          setRateLimited(true);
        } else {
          setFetchFailed(true);
        }
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startPolling is stable within render, adding it causes infinite loop
  }, [sessionId, token, isFreshCompletion, retryCount]);

  if (rateLimited) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-sm text-text-body">{t('rateLimited')}</p>
        <Button
          variant="primary"
          onClick={() => {
            setRateLimited(false);
            setRetryCount((c) => c + 1);
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  // Gate check pending or redirect in progress — show loading
  if (gateCheckComplete === null) {
    return <div className="flex h-full items-center justify-center text-sm text-text-muted">…</div>;
  }

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-sm text-text-body">{t('notFound')}</p>
        <Button variant="primary" onClick={() => router.push('/')}>
          {t('home')}
        </Button>
      </div>
    );
  }

  if (!result) {
    return <div className="flex h-full items-center justify-center text-sm text-text-muted">…</div>;
  }

  // Fully block the page while AI text is being generated for V2 results — no header,
  // no cards, nothing interactive. Once resolved (or the polling timeout fallback kicks
  // in), the normal render below reveals everything at once.
  const isAnalyzing = result.isV2 && isPollingAi;
  if (isAnalyzing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden px-8 text-center text-text-cream"
        style={{
          background:
            'linear-gradient(160deg, var(--color-brand-secondary), var(--color-brand-primary))',
        }}
      >
        <SparkleDecoration top={64} left={34} size={16} color="var(--color-accent-amber)" />
        <SparkleDecoration
          top={108}
          right={38}
          size={12}
          color="rgba(255,249,236,.7)"
          delay={0.6}
        />
        <SparkleDecoration
          bottom={96}
          left={52}
          size={13}
          color="rgba(255,249,236,.6)"
          delay={1.1}
        />
        <span className="flex gap-1.5">
          <span
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-text-cream"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-text-cream"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-text-cream"
            style={{ animationDelay: '300ms' }}
          />
        </span>
        <div className="text-[15px] font-extrabold">{t('analyzing')}</div>
        <div className="text-[13px] font-semibold opacity-80">{t('analyzingHint')}</div>
      </div>
    );
  }

  const riskLabelMap: Record<string, 'riskTinggi' | 'riskSedang' | 'riskRendah'> = {
    tinggi: 'riskTinggi',
    sedang: 'riskSedang',
    rendah: 'riskRendah',
  };
  const riskLabelKey = riskLabelMap[result.level] ?? 'riskRendah';
  const riskLabel = common(riskLabelKey);

  // Hero label: show finalOutput when available (V2 + photo gate resolved),
  // otherwise fall back to chat-only risk level (V1 or no photo yet).
  const hasFinalOutput = result.isV2 && !!result.finalOutput;
  const heroLabel = hasFinalOutput
    ? result.finalOutput === 'SUSPECTED_SCABIES'
      ? t('finalOutputSuspected')
      : t('finalOutputNotScabies')
    : riskLabel;
  // Colour class for the hero chip when showing finalOutput
  const heroFinalClass =
    hasFinalOutput && result.finalOutput === 'SUSPECTED_SCABIES'
      ? 'bg-accent-danger text-text-cream border-accent-danger'
      : hasFinalOutput
        ? 'bg-brand-secondary text-text-cream border-brand-secondary'
        : null;

  // Sub-text shown under the hero chip for V2 sessions
  const heroSublines: string[] = [];
  if (hasFinalOutput) {
    heroSublines.push(t('finalOutputSubChat', { risk: common(riskLabelKey) }));
    if (result.visualPredictionFailed) {
      heroSublines.push(t('finalOutputSubVisual', { result: t('finalOutputVisualFallback') }));
    } else if (result.visualResult) {
      heroSublines.push(
        t('finalOutputSubVisual', {
          result:
            result.visualResult === 'POSITIVE'
              ? t('finalOutputVisualPositive')
              : t('finalOutputVisualNegative'),
        }),
      );
    }
  } else if (result.isV2 && result.gejalaCount !== undefined) {
    heroSublines.push(t('gejalaDetected', { count: result.gejalaCount }));
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-alt">
      <div
        className="relative z-10 flex-none rounded-b-card px-5.5 pt-4 pb-5.5 text-center text-text-cream shadow-sticker-md"
        style={{
          background:
            'linear-gradient(160deg, var(--color-brand-secondary), var(--color-brand-primary))',
        }}
      >
        <SparkleDecoration top={100} left={30} size={14} color="var(--color-accent-amber)" />
        <SparkleDecoration top={74} right={30} size={11} color="rgba(255,249,236,.7)" delay={0.6} />
        <div className="mb-1 flex items-center justify-between text-[13px] font-extrabold">
          <BackButton label={common('back')} onClick={() => router.push('/history')} />
          <LanguageSwitcher variant="light" />
        </div>
        {/* Hero: finalOutput (V2+photo) or chat-risk fallback */}
        <div className="mt-2 flex flex-col items-center gap-1.5">
          {hasFinalOutput ? (
            <span
              className={`inline-flex items-center rounded-pill border-2 px-5 py-2.5 text-[15px] font-extrabold shadow-sticker-sm ${heroFinalClass}`}
            >
              {heroLabel}
            </span>
          ) : (
            <RiskChip
              level={result.level}
              label={heroLabel}
              rotated
              className="px-5 py-2.5 text-[15px]"
            />
          )}
          {heroSublines.map((line) => (
            <div key={line} className="text-[11px] font-semibold opacity-75">
              {line}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-6.5 pt-3.5 pb-5">
        {/* Card 1: Kesimpulan — AI conclusion or i18n fallback */}
        {(result.isV2 || result.kesimpulan) && (
          <Card>
            <div className="mb-1 text-[11px] font-extrabold tracking-wide text-[#A3542F] uppercase">
              {t('summary')}
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-text-strong">
              {result.kesimpulan ||
                (result.isV2 ? t(`fallback.conclusion.${getRiskKey(result.level)}`) : '')}
            </p>
          </Card>
        )}

        {/* Card 2: Untuk Kamu — AI perception response or i18n fallback */}
        {(result.isV2 || result.persona) && (
          <Card variant="amber-wash">
            <div className="mb-1 text-[11px] font-extrabold tracking-wide text-amber-wash-text uppercase">
              {t('forYou')}
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-text-strong">
              {result.persona ||
                (result.isV2 ? t(`fallback.perception.${getRiskKey(result.level)}`) : '')}
            </p>
          </Card>
        )}

        {/* Card 3: Yang Perlu Dilakukan — AI recommendation (split \n), else i18n fallback */}
        {(() => {
          let items: string[] = result.aksi;
          if (result.isV2 && items.length === 0) {
            const fallbackText = t(`fallback.recommendation.${getRiskKey(result.level)}`);
            items = fallbackText.split('\n').filter(Boolean);
          }
          if (items.length === 0) return null;
          return (
            <Card>
              <div className="mb-2 text-[11px] font-extrabold tracking-wide text-hist-q-text uppercase">
                {t('todo')}
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2 text-[13px] leading-snug text-text-strong"
                  >
                    <span className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border-strong bg-brand-secondary">
                      <CheckSquareIcon />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* Card 4: Saran — AI suggestion or i18n fallback */}
        {(result.isV2 || result.saran) && (
          <Card>
            <div className="mb-1 text-[11px] font-extrabold tracking-wide text-accent-danger uppercase">
              {t('advice')}
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-text-strong">
              {result.saran ||
                (result.isV2 ? t(`fallback.suggestion.${getRiskKey(result.level)}`) : '')}
            </p>
          </Card>
        )}

        {/* Visual detection has moved into Detail Penilaian below */}

        <div className="flex items-start gap-2 px-1.5 pt-1 pb-0.5">
          <span className="text-xs text-text-muted">✦</span>
          <p className="m-0 text-[11px] leading-relaxed font-semibold text-text-muted">
            {t('disclaimer')}
          </p>
        </div>
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="self-start px-1.5 text-xs font-bold text-brand-primary underline"
        >
          {showDetail ? t('detailHide') : t('detailShow')}
        </button>

        {showDetail && result.isV2 && result.scoringState && (
          <Card>
            <div className="mb-2 text-[11px] font-extrabold tracking-wide text-[#6b5e4f] uppercase">
              {t('detailTitle')}
            </div>
            <div className="space-y-2.5">
              <div>
                <p className="m-0 mb-1 text-[11px] font-bold text-[#6b5e4f]">{t('detailGejala')}</p>
                <div className="space-y-1">
                  {[
                    { key: 'gatalMalam', label: t('detailGatalMalam') },
                    { key: 'kontakSerupa', label: t('detailKontak') },
                    { key: 'lokasiKhas', label: t('detailLokasi') },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className={`text-sm ${result.scoringState![key] ? 'text-emerald-500' : 'text-[#dcd6c8]'}`}
                      >
                        {result.scoringState![key] ? '●' : '○'}
                      </span>
                      <span
                        className={`text-[12px] ${result.scoringState![key] ? 'font-semibold text-text-strong' : 'text-text-muted'}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="m-0 mb-1 text-[11px] font-bold text-[#6b5e4f]">{t('detailFaktor')}</p>
                <div className="space-y-1">
                  {[
                    { key: 'asrama', label: t('detailAsrama') },
                    { key: 'tukarAlat', label: t('detailTukarAlat') },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className={`text-sm ${result.scoringState![key] ? 'text-emerald-500' : 'text-[#dcd6c8]'}`}
                      >
                        {result.scoringState![key] ? '●' : '○'}
                      </span>
                      <span
                        className={`text-[12px] ${result.scoringState![key] ? 'font-semibold text-text-strong' : 'text-text-muted'}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="m-0 mt-1 text-[10px] text-text-muted">{t('detailNote')}</p>
              {/* Visual detection — integrated here so it reads as part of the
                  evidence breakdown rather than as a separate card above detail */}
              {result.isV2 &&
                (result.visualResult !== undefined || result.visualPredictionFailed) && (
                  <div className="mt-3 border-t border-border-subtle pt-3">
                    <p className="m-0 mb-1 text-[11px] font-bold text-[#6b5e4f]">
                      {t('detailVisualTitle')}
                    </p>
                    {result.visualPredictionFailed ? (
                      <p className="m-0 text-[11.5px] italic leading-snug text-text-muted">
                        {t('detailVisualFallback')}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm ${
                            result.visualResult === 'POSITIVE'
                              ? 'text-risk-medium-text'
                              : 'text-emerald-500'
                          }`}
                        >
                          ●
                        </span>
                        <span className="text-[12px] font-semibold text-text-strong">
                          {result.visualResult === 'POSITIVE'
                            ? t('detailVisualPositive')
                            : t('detailVisualNegative')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </Card>
        )}
      </div>

      {!nudgeDismissed && (
        <div className="relative z-10 mx-6.5 mb-1.5 flex flex-none items-center gap-2.5 rounded-input border-2 border-dashed border-border-dashed bg-surface-card px-2.5 py-2.5">
          <CloudSaveIcon />
          <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-text-body">
            <strong className="font-extrabold text-text-strong">{t('nudgeTitle')}</strong>{' '}
            {t('nudgeBody')}
          </span>
          <button
            onClick={() => showToast(common('loginComingSoon'))}
            className="flex-none rounded-pill border-2 border-border-strong bg-brand-primary px-3.5 py-1.5 text-xs font-extrabold text-text-cream shadow-sticker-sm"
          >
            {common('login')}
          </button>
          <button
            onClick={() => setNudgeDismissed(true)}
            aria-label={common('notNow')}
            className="flex h-[22px] w-[22px] flex-none items-center justify-center border-none bg-transparent"
          >
            <XIcon />
          </button>
        </div>
      )}

      <AppFooter gradient>
        <div className="flex gap-2.5">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => {
              reset();
              router.push('/demographics');
            }}
          >
            {t('newScreening')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={() => {
              reset();
              router.push('/');
            }}
          >
            {t('home')}
          </Button>
        </div>
      </AppFooter>
    </div>
  );
}
