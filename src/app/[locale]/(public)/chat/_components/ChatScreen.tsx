'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Capi from '@/components/Capi';
import AppFooter from '@/components/ui/AppFooter';
import AppHeader from '@/components/ui/AppHeader';
import IconButton from '@/components/ui/IconButton';
import BackButton from '@/components/ui/BackButton';
import { IncognitoIcon } from '@/components/icons';
import { useScreening } from '../../_components/ScreeningProvider';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/components/ui/Toast';
import { useChat } from '../_hooks/useChat';
import { useImageUpload } from '../_hooks/useImageUpload';
import type { SessionPhase } from '@/features/screening-chat-v2/domain/types';
import MessageList from './MessageList';
import VoiceOverlay from './VoiceOverlay';
import QuickReplyChips from './QuickReplyChips';
import ChipsSelector from '@/components/ChipsSelector';
import InputBar from './InputBar';
import ChatFinished from './ChatFinished';
import OfflineBanner from './OfflineBanner';
import RevisionBanner from './RevisionBanner';
import ConsentDialog from './ConsentDialog';
import ImageActionSheet from './ImageActionSheet';
import ChatImageBubble from './ChatImageBubble';
import ImageLightbox from './ImageLightbox';
import { CONFIG, SCREENING_CHAT_VERSION, VISUAL_DETECTION_GATE_AT_START } from '@/lib/config';
import { imageGateStatusEnvelopeSchema } from '@/lib/vision';
import type { ChatOption } from '@/types/screening-ui';

export default function ChatScreen() {
  const t = useTranslations('chat');
  const tImageUpload = useTranslations('imageUpload');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const {
    incognito,
    setIncognito,
    demographics,
    sessionId,
    shareToken,
    imageConsentGiven,
    imageGateResolved,
    setImageConsentGiven,
    setImageGateResolved,
    phase,
  } = useScreening();
  const { showToast } = useToast();
  const chatState = useChat();
  const {
    ready,
    msgs,
    typing,
    finished,
    sendReply,
    retry,
    chipsRequest,
    chipsSubState,
    submitChipsAnswer,
    appendImageTurn,
    appendBotMessage: _appendBotMessage,
    removeMessage,
    updatePhase,
  } = chatState;
  const [input, setInput] = useState('');

  // --- Visual Detection: image upload flow state ---
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showImageActionSheet, setShowImageActionSheet] = useState(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  /**
   * Set to true when the skip-effect commits the final upload-failed row to
   * the transcript. Hides the pending bubble so the same image does not appear
   * twice (once as the pending overlay, once as the committed transcript row).
   */
  const [skipCommitted, setSkipCommitted] = useState(false);
  const imageUpload = useImageUpload();
  /** Guards against appending the photo turn twice if the effect re-runs. */
  /**
   * Guards the skip effect (MAX_UPLOAD_FAILURES path) from appending twice.
   * Never reset by the retry handler — a gate that was skipped cannot be
   * un-skipped.
   */
  const imageTurnAppended = useRef(false);
  /**
   * Guards the done effect from appending the image turn twice across retries.
   * Reset to false by handleRetryImageFromTranscript so the effect can fire
   * again after each retry attempt.
   */
  const doneTurnAppended = useRef(false);
  /** Id of the failed transcript row to remove once the retry is in-flight. */
  const pendingRemoveRef = useRef<string | null>(null);

  // Visual detection is a v2-only feature (Requirement 12.1). In v1 the gate
  // starts resolved, so `needsImage` is false and none of this UI mounts.
  const isVisualDetectionActive = SCREENING_CHAT_VERSION === 'v2';
  const needsImage = isVisualDetectionActive && !imageGateResolved;
  // The gate is a real phase now, so the server decides when it is open rather
  // than the client inferring it from SCREENING_COMPLETE. The flag remains a
  // temporary testing switch that opens it from the first turn instead.
  const imageGateOpen = VISUAL_DETECTION_GATE_AT_START || phase === 'AWAITING_IMAGE';
  // A failed transport attempt counts as "not submitted": nothing reached the
  // server, so there is no stored photo to lock. Keeping "+" live is the only
  // way back — there is deliberately no retry button, and a santri whose upload
  // dropped must not be trapped with the gate closed forever.
  const imageNotSubmitted =
    needsImage && (imageUpload.status === 'idle' || imageUpload.status === 'error');
  // `shouldHighlightAttach` is computed after `isProcessing` is derived below.

  // The submit request runs the prediction retry loop server-side before it
  // responds, so `done` means the gate has genuinely resolved (Requirement 2.2).
  // However, bot feedback is DEFERRED until the user has exhausted all retry
  // attempts (3 total), so the user has a chance to retry with a different photo.
  useEffect(() => {
    // When a retry from the transcript is in flight, remove the stale failed
    // row as soon as the pending bubble takes over. Flush on any status
    // transition so the stale row is never left in the transcript regardless
    // of whether the retry succeeds, fails, or skips.
    if (pendingRemoveRef.current) {
      removeMessage(pendingRemoveRef.current);
      pendingRemoveRef.current = null;
    }

    if (imageUpload.status !== 'done' || doneTurnAppended.current) return;
    if (!imageUpload.localUrl || !imageUpload.botMessage) return;
    // A genuine success shows feedback immediately regardless of how many
    // attempts it took to get there — `done` with no prediction failure means
    // the photo was analysed, full stop. The retries-exhausted wait below is
    // only for a prediction failure: it gives the santri a chance to retry with
    // a different photo before the bot gives up and shows the failure message.
    // Applying it unconditionally used to swallow the entire response — photo,
    // bot message, and the perception question that follows — on a first-try
    // success, because a single successful attempt never reaches
    // MAX_UPLOAD_FAILURES.
    const retriesExhausted =
      imageUpload.totalAttempts >= CONFIG.visualDetection.MAX_UPLOAD_FAILURES;
    if (imageUpload.predictionFailed && !retriesExhausted) return;

    doneTurnAppended.current = true;
    // Sync client phase from the upload response so the gate and input bar
    // are immediately correct — without this the phase stays at AWAITING_IMAGE
    // until the next chat turn's SSE stream arrives.
    if (imageUpload.phase) {
      updatePhase(imageUpload.phase as SessionPhase);
    }
    // Mirror the rows the server just persisted, using its wording, so the live
    // view matches what a refresh would show.
    //
    // followUpMessage is withheld only on a prediction failure: that botMessage
    // already ends in "Siap lanjut?", a question of its own, so showing the
    // severity question in the same turn would stack two questions on top of
    // each other. A genuine success asks nothing — "Lanjut ke pertanyaan
    // berikutnya ya" is a statement — so there is no second question to
    // collide with.
    //
    // This has to track `advancePhaseAfterImage`'s own `suppressFollowUp`
    // exactly. The server marks `perceptionStep: ASK_SEVERITY` in the database
    // whenever it returns a non-null followUpMessage — recording that the
    // question was asked. Suppressing it here unconditionally used to leave
    // that record true while the santri had never seen the question: a later
    // "baik" was scored against a question that was invisible, and produced
    // the classifier's "coba jawab pakai angka" fallback instead of ever
    // showing what it wanted answered.
    appendImageTurn(
      imageUpload.localUrl,
      imageUpload.botMessage,
      imageUpload.predictionFailed ? null : imageUpload.followUpMessage,
      // The photo reached the server either way — `done` means the HTTP round
      // trip succeeded. A prediction failure is the vision model, not the
      // upload, so it must not read as "please resend the photo".
      imageUpload.predictionFailed ? 'analysis' : undefined,
    );
    setImageGateResolved(true);
  }, [
    imageUpload.status,
    imageUpload.localUrl,
    imageUpload.botMessage,
    imageUpload.followUpMessage,
    imageUpload.predictionFailed,
    imageUpload.phase,
    imageUpload.totalAttempts,
    appendImageTurn,
    setImageGateResolved,
    removeMessage,
    updatePhase,
  ]);

  // After CONFIG.visualDetection.MAX_UPLOAD_FAILURES total attempts with all
  // failing (network errors), the gate is skipped automatically. The skip
  // endpoint calls advancePhaseAfterImage server-side (same state machine, no
  // photo required) and returns the follow-up question the next phase owes.
  useEffect(() => {
    // Only trigger skip when ALL attempts failed (no successful response at all)
    if (imageUpload.totalAttempts < CONFIG.visualDetection.MAX_UPLOAD_FAILURES) return;
    if (imageUpload.status !== 'error') return; // Only skip if the last attempt was an error
    if (imageTurnAppended.current) return;
    if (!sessionId) return;

    // Lock the guard synchronously so neither this effect nor the done-effect
    // can double-append if they both fire in the same flush.
    imageTurnAppended.current = true;
    doneTurnAppended.current = true; // also block the done-effect from firing

    // If a retry was in flight, clear the stale row before appending the skip
    // acknowledgement so it is never left orphaned in the transcript.
    if (pendingRemoveRef.current) {
      removeMessage(pendingRemoveRef.current);
      pendingRemoveRef.current = null;
    }

    // Hide the pending bubble — the transcript row from appendImageTurn below
    // will be the single visible copy of the image from this point on.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time gate resolution orchestrated by this effect
    setSkipCommitted(true);

    // Append the skip acknowledgement immediately — do not wait for the skip
    // endpoint so the santri sees feedback right away even if the network is
    // the reason uploads are failing.
    const skipMessage = tImageUpload('uploadSkipped');
    // Pass the last failed image URL so it remains visible in the transcript.
    // This is the genuine transport failure: none of the attempts reached the
    // server, so 'upload' is the correct caption here.
    appendImageTurn(imageUpload.localUrl, skipMessage, null, 'upload');
    setImageGateResolved(true);

    // Do NOT reset the upload state here — reset() would revoke the object URL
    // and the image would disappear from the transcript. The pending bubble is
    // already gone (imageTurnAppended.current is true), so leaving the hook
    // state in place is harmless.

    // Fire-and-forget: tell the server to advance the phase and get the
    // follow-up question. The skip message ends with "Siap lanjut?" which
    // expects a user response first, so we do NOT display the followUpMessage
    // here. The chat.service will send it when the user responds.
    fetch('/api/screening/image/skip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {
      // Skip endpoint unreachable — the acknowledgement is already shown,
      // and the phase will correct itself on the next chat turn.
    });
  }, [
    imageUpload.totalAttempts,
    imageUpload.status,
    imageUpload.localUrl,
    sessionId,
    appendImageTurn,
    setImageGateResolved,
    tImageUpload,
    removeMessage,
    setSkipCommitted,
  ]);

  // `imageGateResolved` lives only in memory, so a refresh resets it to false
  // even when the photo is already stored. Without this the bot would ask for a
  // second photo and the "+" would light up again on a resumed session.
  useEffect(() => {
    if (!isVisualDetectionActive || !sessionId || imageGateResolved) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/screening/image/${sessionId}`);
        if (!res.ok) return;

        const envelope = imageGateStatusEnvelopeSchema.parse(await res.json());
        if (!cancelled && envelope.data?.resolved === true) {
          setImageGateResolved(true);
        }
      } catch {
        // Leave the gate closed: asking for a photo that already exists is
        // recoverable (the server replays the stored result), whereas opening
        // the gate on a failed check would let an unresolved session through.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isVisualDetectionActive, sessionId, imageGateResolved, setImageGateResolved]);

  // --- V2: result revision banner ---
  const resultRevision = 'resultRevision' in chatState ? (chatState.resultRevision as number) : 0;
  const prevRevisionRef = useRef(resultRevision);
  const [showRevisionBanner, setShowRevisionBanner] = useState(false);

  useEffect(() => {
    if (resultRevision > prevRevisionRef.current && resultRevision > 1) {
      setShowRevisionBanner(true);
    }
    prevRevisionRef.current = resultRevision;
  }, [resultRevision]);

  // --- V2: processing state (disable input while bot is working or chips are active) ---
  const isProcessing = typing || ('isProcessing' in chatState && Boolean(chatState.isProcessing));

  // Delay highlighting the attach button until the bot has finished typing so
  // the "+" glow does not appear before the instruction bubble has landed.
  const shouldHighlightAttach = imageGateOpen && imageNotSubmitted && !isProcessing;

  const chipsActive = chipsSubState === 'CHIPS_ACTIVE';

  // --- V2: chips selection state (for InputBar preview) ---
  const [chipsSelections, setChipsSelections] = useState<string[]>([]);
  const [_chipsValid, setChipsValid] = useState(false);
  const [chipsEditMode, setChipsEditMode] = useState(false);

  const handleChipsSelectionChange = useCallback(
    (selections: string[], isValid: boolean) => {
      setChipsSelections(selections);
      setChipsValid(isValid);

      // Helper: resolve token → label using chipsRequest options
      const tokenToLabel = (token: string): string => {
        if (!chipsRequest) return token;
        const allOptions = [
          ...chipsRequest.options,
          ...(chipsRequest.groups?.flatMap((g) => g.options) ?? []),
        ];
        const found = allOptions.find((o) => o.token === token);
        return found?.label ?? token;
      };

      // Sync chips selection to input bar as preview text (show labels, not tokens)
      if (!chipsEditMode) {
        const previewText = selections
          .filter((s) => s !== 'Lainnya')
          .map(tokenToLabel)
          .join(', ');
        setInput(previewText);
      }

      // If "Lainnya" was just selected (via internal click, not edit mode) → enter edit mode
      if (selections.includes('Lainnya') && !chipsEditMode) {
        const textItems = selections.filter((s) => s !== 'Lainnya').map(tokenToLabel);
        setInput(textItems.length > 0 ? textItems.join(', ') + ', ' : '');
        setChipsEditMode(true);
      }
    },
    [chipsEditMode, chipsRequest],
  );

  // Derive chip selections from input text (for text→chip sync in edit mode)
  const chipsFromText = useMemo(() => {
    if (!chipsEditMode || !chipsRequest) return undefined;
    const tokens = chipsRequest.options.filter((o) => o.token !== 'Lainnya').map((o) => o.token);
    const inputLower = input.toLowerCase();
    const matched = tokens.filter((token) => inputLower.includes(token.toLowerCase()));
    // Always include "Lainnya" since we're in edit mode
    return [...matched, 'Lainnya'];
  }, [chipsEditMode, chipsRequest, input]);

  // Handle chip toggle while in edit mode — update input text
  const handleChipToggleInEditMode = useCallback(
    (token: string, selected: boolean) => {
      if (token === 'Lainnya') {
        if (!selected) {
          // Unselect Lainnya → exit edit mode
          // Derive which chips are still in the text
          const matchedTokens: string[] = [];
          if (chipsRequest) {
            const tokens = chipsRequest.options
              .filter((o) => o.token !== 'Lainnya')
              .map((o) => o.token);
            const inputLower = input.toLowerCase();
            for (const t of tokens) {
              if (inputLower.includes(t.toLowerCase())) matchedTokens.push(t);
            }
          }
          // Set input to matched tokens preview (or empty)
          // Exit edit mode first, then update input — order matters for re-render
          setChipsEditMode(false);
          setInput('');
          // Update chipsSelections directly (bypass onSelectionChange race)
          setChipsSelections(matchedTokens);
        }
        return;
      }
      setInput((prev) => {
        if (selected) {
          // Add token to text
          const trimmed = prev.trim();
          if (trimmed.endsWith(',')) return `${trimmed} ${token}, `;
          if (trimmed.length === 0) return `${token}, `;
          return `${trimmed}, ${token}, `;
        } else {
          // Remove token from text (case-insensitive)
          const regex = new RegExp(`${token}\\s*,?\\s*`, 'gi');
          const cleaned = prev
            .replace(regex, '')
            .replace(/,\s*$/, '')
            .replace(/^\s*,\s*/, '')
            .trim();
          return cleaned ? `${cleaned}, ` : '';
        }
      });
    },
    [chipsRequest, input],
  );

  // Chips preview text for InputBar (readonly mode only)
  const chipsInputPreview = useMemo(() => {
    if (!chipsActive || chipsEditMode) return undefined;
    if (chipsSelections.length === 0) return undefined;
    const allOptions = [
      ...(chipsRequest?.options ?? []),
      ...(chipsRequest?.groups?.flatMap((g) => g.options) ?? []),
    ];
    const labels = chipsSelections
      .filter((s) => s !== 'Lainnya')
      .map((token) => {
        const found = allOptions.find((o) => o.token === token);
        return found?.label ?? token;
      });
    return labels.length > 0 ? labels.join(', ') : undefined;
  }, [chipsActive, chipsSelections, chipsEditMode, chipsRequest]);

  // --- V2: quick replies from SSE events ---
  const v2QuickReplies =
    'quickReplies' in chatState && chatState.quickReplies
      ? (chatState.quickReplies as Array<{ token: string; label: string; icon?: string }>)
      : null;

  const playful = demographics.pendidikan === 'SD' || demographics.pendidikan === 'Primary';

  const { recording, voiceMode, speakingId, startSTT, stopSTT, speak, toggleVoiceMode } = useVoice({
    locale,
    playful,
    onTranscript: (text) => setInput(text),
  });

  const lastMessage = msgs.at(-1);
  // Allow sending when not finished and not processing
  const awaiting = !finished && !isProcessing;
  const options = lastMessage?.role === 'bot' && awaiting ? (lastMessage.options ?? []) : [];

  // Voice mode: speak every new bot message aloud, then reopen the mic.
  useEffect(() => {
    if (!voiceMode) return;
    const last = msgs.at(-1);
    if (!last || last.role !== 'bot') return;
    speak(last.id, last.text, () => {
      if (!finished) startSTT(last.options?.[0]?.replyText);
    });
    // Only re-run when a new message actually arrives, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.length, voiceMode]);

  const submit = () => {
    const value = input.trim();
    if (!value || !awaiting) return;
    setInput('');
    sendReply(value);
  };

  const selectOption = (option: ChatOption, index: number) => {
    if (!awaiting) return;
    if ('sendQuickReply' in chatState && typeof chatState.sendQuickReply === 'function') {
      (chatState.sendQuickReply as (token: string, label?: string) => void)(
        option.replyText,
        option.label,
      );
    } else {
      sendReply(option.label, index);
    }
  };

  const micTap = () => {
    if (recording) {
      stopSTT();
      return;
    }
    if (!awaiting) return;
    startSTT(options[0]?.replyText);
  };

  const toggleIncognito = () => {
    const next = !incognito;
    setIncognito(next);

    const hasSeenExplainer = localStorage.getItem('sicaps_incognito_seen');
    if (!hasSeenExplainer && next) {
      showToast(t('incognitoExplainer'));
      try {
        localStorage.setItem('sicaps_incognito_seen', '1');
      } catch {
        /* ignore */
      }
    } else {
      showToast(next ? t('incognitoOn') : t('incognitoOff'));
    }
  };

  const status = recording ? t('statusListening') : typing ? t('statusTyping') : t('statusOnline');

  // --- Visual Detection: attach button handler ---
  const handleAttach = useCallback(() => {
    // While the gate is open with no image yet, "+" starts the upload flow.
    if (imageGateOpen && imageNotSubmitted) {
      // Consent is asked once per session; afterwards go straight to the sheet.
      if (imageConsentGiven) {
        setShowImageActionSheet(true);
      } else {
        setShowConsentDialog(true);
      }
    }
  }, [imageGateOpen, imageNotSubmitted, imageConsentGiven]);

  // --- Visual Detection: consent dialog handlers ---
  const handleConsentAccept = useCallback(() => {
    setImageConsentGiven(true);
    setShowConsentDialog(false);
    // Show image action sheet after accepting consent
    setShowImageActionSheet(true);
  }, [setImageConsentGiven]);

  const handleConsentDecline = useCallback(() => {
    setShowConsentDialog(false);
  }, []);

  // --- Visual Detection: image action sheet handlers ---
  const handleImageActionSheetClose = useCallback(() => {
    setShowImageActionSheet(false);
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!sessionId) return;
      // Upload the file using the useImageUpload hook
      imageUpload.upload(file, sessionId);
    },
    [sessionId, imageUpload],
  );

  const handleImageValidationError = useCallback(
    (error: 'invalid_type' | 'file_too_large') => {
      const message =
        error === 'invalid_type' ? tImageUpload('invalidType') : tImageUpload('fileTooLarge');
      showToast(message);
    },
    [showToast, tImageUpload],
  );

  // Shown only while the submission is in flight or has failed. A genuine
  // success (done, no prediction failure) is excluded outright — the done-effect
  // above commits it to the transcript on the very same render that `done`
  // first appears, so showing this bubble too would duplicate the photo. A
  // prediction failure still shows here, but only until retries are exhausted:
  // it gives the santri a chance to retry with a different photo before the
  // bot gives up and commits the failure message instead.
  const attemptsLeft = CONFIG.visualDetection.MAX_UPLOAD_FAILURES - imageUpload.totalAttempts;
  const retriesExhausted = attemptsLeft <= 0;
  const showPendingBubble =
    imageUpload.localUrl &&
    !skipCommitted &&
    (imageUpload.status === 'uploading' ||
      imageUpload.status === 'error' ||
      (imageUpload.status === 'done' && imageUpload.predictionFailed && !retriesExhausted));

  const pendingImageBubble = showPendingBubble ? (
    <ChatImageBubble
      src={imageUpload.localUrl}
      status={imageUpload.status}
      // Show retry button for error status OR for done with predictionFailed
      onRetry={
        attemptsLeft > 0 &&
        sessionId &&
        (imageUpload.status === 'error' || imageUpload.predictionFailed)
          ? () => imageUpload.retry(sessionId)
          : undefined
      }
      attemptsLeft={attemptsLeft}
      // Show error styling for network errors or prediction failures
      // BUT NOT during uploading — let the spinner show instead
      showError={
        imageUpload.status !== 'uploading' &&
        (imageUpload.status === 'error' || imageUpload.predictionFailed)
      }
      // status === 'error' is the transport failing; predictionFailed is the
      // photo arriving fine and the vision model failing to read it.
      failureReason={imageUpload.status === 'error' ? 'upload' : 'analysis'}
    />
  ) : null;

  // Retry handler for a prediction-failed image that was already committed to
  // the transcript. Queues the stale row for removal (via pendingRemoveRef so
  // the pending bubble is already visible before the row disappears), resets
  // the append guard, then kicks off the re-upload.
  const handleRetryImageFromTranscript = useCallback(
    (messageId: string) => {
      if (!sessionId) return;
      // Mark the row for removal — the effect above will remove it once the
      // upload transitions to 'uploading' and pendingImageBubble is visible.
      pendingRemoveRef.current = messageId;
      doneTurnAppended.current = false;
      imageUpload.retry(sessionId);
    },
    [sessionId, imageUpload],
  );

  return (
    <div
      className="relative flex h-full flex-col bg-surface-alt"
      style={{
        backgroundImage: 'radial-gradient(var(--color-dot-grid) 1px, transparent 1.1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <AppHeader
        border
        bg="bg-surface-card"
        left={<BackButton label={common('back')} onClick={() => router.push('/')} />}
        center={
          <div className="flex items-center gap-3">
            <Capi variant="logo" />
            <div className="min-w-0">
              <div className="font-display text-[15px] font-normal text-text-strong">Capi</div>
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand-primary">
                <span className="inline-block h-1.5 w-1.5 flex-none rounded-full border-[1.5px] border-border-strong bg-brand-secondary" />
                {status}
              </div>
            </div>
          </div>
        }
        right={
          <IconButton
            variant={incognito ? 'active' : 'default'}
            onClick={toggleIncognito}
            aria-label={t('incognitoTitle')}
            aria-pressed={incognito}
          >
            <IncognitoIcon color={incognito ? '#FFF9EC' : 'var(--color-text-strong)'} />
          </IconButton>
        }
      />

      <OfflineBanner onRetry={retry} />

      {showRevisionBanner && (
        <RevisionBanner revision={resultRevision} onDismiss={() => setShowRevisionBanner(false)} />
      )}

      <MessageList
        messages={ready ? msgs : []}
        typing={typing}
        finished={finished}
        speakingId={speakingId}
        onSpeak={speak}
        incognito={incognito}
        pending={pendingImageBubble}
        pendingKey={imageUpload.status}
        onExpandImage={setExpandedImageUrl}
        onRetryImage={attemptsLeft > 0 ? handleRetryImageFromTranscript : undefined}
        imageRetryAttemptsLeft={attemptsLeft}
      />
      {incognito && (
        <div className="pointer-events-none absolute inset-x-0 top-[82px] z-20 flex justify-center">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-pill border border-white/40 bg-white/50 px-3.5 py-1.5 text-[10.5px] font-bold text-text-muted shadow-[0_2px_12px_rgba(108,77,246,0.08)] backdrop-blur-md">
            🕶️ {t('incognitoBanner')}
          </span>
        </div>
      )}

      {recording && <VoiceOverlay />}

      {CONFIG.features.ENABLE_QUICK_REPLY_CHIPS && options.length > 0 && !recording && (
        <QuickReplyChips
          replies={options.map((opt) => ({ token: opt.replyText, label: opt.label }))}
          onSelect={(token, _label) => {
            const matched = options.find((o) => o.replyText === token);
            if (matched) selectOption(matched, options.indexOf(matched));
          }}
          disabled={isProcessing}
        />
      )}

      {/* Same ordering hazard as chipsRequest below: `quick_replies` can arrive
          before the token stream it answers has been flushed into `msgs`. */}
      {v2QuickReplies && v2QuickReplies.length > 0 && !recording && !finished && !typing && (
        <QuickReplyChips
          replies={v2QuickReplies}
          onSelect={(token, label) => {
            if ('sendQuickReply' in chatState && typeof chatState.sendQuickReply === 'function') {
              (chatState.sendQuickReply as (token: string, label?: string) => void)(token, label);
            } else {
              sendReply(label || token);
            }
          }}
          disabled={isProcessing}
        />
      )}

      {finished && (
        <AppFooter>
          {/* Requirement 1.3: the Attach_Button stays mounted and interactive
              after the chat finishes, for as long as the gate is unresolved.
              The text field is disabled — only "+" is live. */}
          {needsImage && (
            <InputBar
              value=""
              onChange={() => {}}
              onSubmit={() => {}}
              placeholder={tImageUpload('inputHintAwaitingImage')}
              disabled
              recording={false}
              voiceMode={false}
              onMicTap={() => {}}
              onToggleVoiceMode={() => {}}
              onAttach={handleAttach}
              highlighted={imageNotSubmitted}
            />
          )}
          <ChatFinished
            incognito={incognito}
            onSeeResult={() =>
              router.push(`/result?session=${sessionId}&token=${shareToken}&fresh=1`)
            }
          />
        </AppFooter>
      )}

      {!finished && (
        <AppFooter>
          {/* `typing` covers the gap between the server's chips_request event
              arriving and its accompanying intro text actually landing as a
              transcript bubble: the server streams the intro as `token`
              events first, but those only become a message on `done` — while
              `chips_request` sets chipsRequest immediately. Rendering the
              selector as soon as chipsRequest existed used to show the answer
              buttons before the question they answer was on screen. */}
          {chipsRequest && !typing && (
            <ChipsSelector
              request={chipsRequest}
              onSelectionChange={handleChipsSelectionChange}
              onChipToggleInEditMode={handleChipToggleInEditMode}
              externalSelections={chipsFromText}
              disabled={isProcessing}
            />
          )}
          <InputBar
            value={input}
            onChange={setInput}
            onSubmit={
              chipsActive && chipsSelections.length > 0
                ? () => {
                    // Resolve tokens → labels for display
                    const allOptions = [
                      ...(chipsRequest?.options ?? []),
                      ...(chipsRequest?.groups?.flatMap((g) => g.options) ?? []),
                    ];
                    const labels = chipsSelections
                      .filter((s) => s !== 'Lainnya')
                      .map((token) => {
                        const found = allOptions.find((o) => o.token === token);
                        return found?.label ?? token;
                      });
                    const displayText = chipsEditMode
                      ? [...labels, input.trim()].filter(Boolean).join(', ')
                      : labels.join(', ');

                    submitChipsAnswer(
                      chipsSelections,
                      chipsEditMode ? input.trim() || undefined : undefined,
                      displayText || undefined,
                    );
                    setChipsSelections([]);
                    setInput('');
                    setChipsEditMode(false);
                  }
                : submit
            }
            placeholder={
              chipsEditMode
                ? 'Ketik lokasi lainnya...'
                : recording
                  ? t('placeholderRecording')
                  : voiceMode
                    ? t('placeholderVoice')
                    : isProcessing
                      ? t('placeholderProcessing')
                      : t('placeholderIdle')
            }
            disabled={isProcessing}
            chipsActive={chipsActive && !chipsEditMode}
            chipsPreview={chipsInputPreview}
            recording={recording}
            voiceMode={voiceMode}
            onMicTap={micTap}
            onToggleVoiceMode={toggleVoiceMode}
            onAttach={handleAttach}
            highlighted={shouldHighlightAttach}
          />
        </AppFooter>
      )}

      {/* Visual Detection: Consent Dialog */}
      <ConsentDialog
        open={showConsentDialog}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

      {/* Visual Detection: Image Action Sheet */}
      <ImageActionSheet
        open={showImageActionSheet}
        onClose={handleImageActionSheetClose}
        onFileSelect={handleFileSelect}
        onValidationError={handleImageValidationError}
      />

      {/* Visual Detection: full-size view of the submitted photo */}
      <ImageLightbox src={expandedImageUrl} onClose={() => setExpandedImageUrl(null)} />
    </div>
  );
}
