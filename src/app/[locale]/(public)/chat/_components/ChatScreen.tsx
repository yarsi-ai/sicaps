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
import MessageList from './MessageList';
import VoiceOverlay from './VoiceOverlay';
import QuickReplyChips from './QuickReplyChips';
import ChipsSelector from '@/components/ChipsSelector';
import InputBar from './InputBar';
import ChatFinished from './ChatFinished';
import OfflineBanner from './OfflineBanner';
import RevisionBanner from './RevisionBanner';
import { CONFIG } from '@/lib/config';
import type { ChatOption } from '@/types/screening-ui';

export default function ChatScreen() {
  const t = useTranslations('chat');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { incognito, setIncognito, demographics, sessionId, shareToken } = useScreening();
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
  } = chatState;
  const [input, setInput] = useState('');

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

      {v2QuickReplies && v2QuickReplies.length > 0 && !recording && !finished && (
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
          {chipsRequest && (
            <ChipsSelector
              request={chipsRequest}
              onSelectionChange={handleChipsSelectionChange}
              onChipToggleInEditMode={handleChipToggleInEditMode}
              externalSelections={chipsFromText}
              disabled={typing || isProcessing}
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
            onAttach={() => showToast(t('attachToast'))}
          />
        </AppFooter>
      )}
    </div>
  );
}
