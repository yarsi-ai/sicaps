/**
 * Frontend-specific screening types used by the public UI components.
 * These types match the .private/frontend design reference.
 */

export type Gender = 'L' | 'P' | '';
export type Persona = 'adequate' | 'underestimate';
export type RiskKey = 'tinggi' | 'sedang' | 'rendah';
export type ScreeningMode = 'ai' | 'q';

/**
 * Lifecycle of the single image submission in a screening session.
 *
 * `done` covers upload *and* prediction, because the submit request resolves
 * both before responding. Shared by the upload hook and the chat bubble so the
 * two cannot drift apart.
 */
export type ImageUploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export interface ScriptOption {
  /** short quick-reply chip label */
  t: string;
  /** full reply text shown in the transcript */
  r: string;
  /** score points (0-2) */
  s: number;
}

export interface ScriptStep {
  cat: string;
  q: string;
  opts: ScriptOption[];
}

export interface ChatOption {
  label: string;
  replyText: string;
}

/**
 * What a chat message represents.
 *
 * `image` is the turn where a santri submitted a screening photo. Its `text`
 * still reads sensibly, so a renderer that does not special-case it degrades to
 * a plain sentence rather than an empty bubble.
 */
export type ChatMessageKind = 'text' | 'image';

export interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
  /** Defaults to `text` when absent. */
  kind?: ChatMessageKind;
  /**
   * Object URL for an `image` turn, present only while the submitting document
   * is alive. Never persisted: after a refresh the turn renders as a locked
   * placeholder instead of the photo.
   */
  imageUrl?: string;
  /**
   * Set when the image turn should render with the error style rather than
   * "done". Two distinct causes get two distinct captions:
   * - 'upload': the photo never reached the server (network failure, or the
   *   gate was skipped after exhausting upload retries).
   * - 'analysis': the photo reached the server but the vision model could not
   *   produce a verdict. The screening result still comes from the chat.
   */
  imageFailure?: 'upload' | 'analysis';
  step?: number;
  done?: boolean;
  /** quick-reply chips for this bot question, if any */
  options?: ChatOption[];
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  shareToken: string;
  createdAt: string;
  score: number;
  level: RiskKey;
  mode: ScreeningMode;
  finished: boolean;
  nama?: string;
  usia?: number;
  jenisKelamin?: string;
}

export interface RiskLevel {
  key: RiskKey;
  label: string;
  bg: string;
  color: string;
}

export interface ResultCopy {
  kesimpulan: string;
  persona: string;
  aksi: string[];
  saran: string;
}

export interface DemographicsInput {
  nama?: string;
  usia?: number;
  jenisKelamin?: Gender;
  pendidikan?: string;
}
