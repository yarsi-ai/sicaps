'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpeechRecognitionCtor, type SpeechRecognitionLike } from '@/lib/speech';

const STT_FALLBACK_MS = 1700;

interface UseVoiceOptions {
  locale: string;
  /** Slightly slower/higher-pitched voice for younger/primary-school users. */
  playful?: boolean;
  onTranscript: (text: string) => void;
}

/** STT (tap-to-talk, with a graceful fallback) + TTS + the voice-mode loop. */
export function useVoice({ locale, playful = false, onTranscript }: UseVoiceOptions) {
  const [recording, setRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sttTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ttsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const speakingIdRef = useRef<string | null>(null);

  const stopSTT = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    clearTimeout(sttTimer.current);
    setRecording(false);
  }, []);

  const startSTT = useCallback(
    (fallbackText?: string) => {
      setRecording(true);
      const SR = getSpeechRecognitionCtor();
      const fallback = () => {
        setRecording(false);
        if (fallbackText) onTranscript(fallbackText);
      };
      if (!SR) {
        sttTimer.current = setTimeout(fallback, STT_FALLBACK_MS);
        return;
      }
      try {
        const rec = new SR();
        rec.lang = locale === 'en' ? 'en-US' : 'id-ID';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        let got = false;
        rec.onresult = (e) => {
          got = true;
          setRecording(false);
          onTranscript(e.results[0]![0]!.transcript);
        };
        rec.onerror = () => {
          if (!got) sttTimer.current = setTimeout(fallback, 200);
        };
        rec.onend = () => {
          setRecording((r) => (r ? false : r));
          if (!got) sttTimer.current = setTimeout(() => !got && fallback(), 150);
        };
        recognitionRef.current = rec;
        rec.start();
      } catch {
        sttTimer.current = setTimeout(fallback, STT_FALLBACK_MS);
      }
    },
    [locale, onTranscript],
  );

  const speak = useCallback(
    (id: string, text: string, onEnd?: () => void) => {
      const clean = text.replace(/[\u{1F000}-\u{1FAFF}☀-➿←-⇿⬀-⯿]/gu, '').trim();
      speakingIdRef.current = id;
      setSpeakingId(id);
      const done = () => {
        if (speakingIdRef.current === id) {
          speakingIdRef.current = null;
          setSpeakingId(null);
        }
        onEnd?.();
      };
      const synth = window.speechSynthesis;
      if (!synth || !clean) {
        ttsTimer.current = setTimeout(done, Math.min(Math.max(clean.length * 55, 700), 3200));
        return;
      }
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.rate = playful ? 0.85 : 0.95;
        u.pitch = playful ? 1.1 : 1.0;
        u.lang = locale === 'en' ? 'en-US' : 'id-ID';
        u.onend = done;
        u.onerror = done;
        synth.speak(u);
        ttsTimer.current = setTimeout(done, Math.min(Math.max(clean.length * 90, 1500), 6000));
      } catch {
        done();
      }
    },
    [locale, playful],
  );

  const toggleVoiceMode = useCallback(() => setVoiceMode((v) => !v), []);

  useEffect(
    () => () => {
      clearTimeout(sttTimer.current);
      clearTimeout(ttsTimer.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return { recording, voiceMode, speakingId, startSTT, stopSTT, speak, toggleVoiceMode };
}
