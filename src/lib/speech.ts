// Minimal Web Speech API (SpeechRecognition) typings — TypeScript's DOM lib
// doesn't ship these yet, and browser support/prefixing is inconsistent.

export interface SpeechRecognitionResultLike {
  transcript: string;
}

export interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [index: number]: SpeechRecognitionResultLike;
    };
  };
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
