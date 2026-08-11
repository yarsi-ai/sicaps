import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export const PROMPT_VERSION = 'v1';

export interface SessionContext {
  theme: 'playful' | 'hybrid';
  locale: 'id' | 'en';
  turn: number;
  demographics: { age: number; gender: string };
  categoriesCovered: string[];
  categoriesRemaining: string[];
  /** Instruction from the Chat Engine guiding this turn's behavior */
  instruction?: {
    type: string;
    targetCategory: string | null;
    isFollowUp: boolean;
  };
}

export interface OutputContext {
  scores: Record<string, number>;
  riskLevel: 'HIGH' | 'MODERATE' | 'LOW';
  matchedKeywords: Record<string, string[]>;
  perception: 'UNDERESTIMATE' | 'OVERESTIMATE' | 'BARRIER' | 'ADEQUATE' | null;
  locale: 'id' | 'en';
  theme: 'playful' | 'hybrid';
}

/**
 * Build the system message for a chat turn.
 * Concatenates persona + session context + backend instruction,
 * separated by double newlines. Backend instruction placed last
 * for highest LLM attention weight.
 */
export function buildSystemMessage(session: SessionContext): string {
  if (session == null) {
    throw new Error('buildSystemMessage: session is required and cannot be null or undefined');
  }

  const persona = buildPersona(session);
  const context = buildSessionContext(session);
  const instruction = buildBackendInstruction(session);
  const turnGuidance = buildTurnGuidance(session);

  const parts = [persona, context];
  if (turnGuidance) parts.push(turnGuidance);
  parts.push(instruction);

  return parts.join('\n\n');
}

/**
 * Build the full messages array for a chat turn.
 * Returns: [system, ...history, userMessage]
 */
export function buildMessages(
  session: SessionContext,
  history: Array<{ role: 'assistant' | 'user'; content: string }>,
  userMessage: string,
): ChatCompletionMessageParam[] {
  if (session == null) {
    throw new Error('buildMessages: session is required and cannot be null or undefined');
  }
  if (history == null) {
    throw new Error('buildMessages: history is required and cannot be null or undefined');
  }
  if (userMessage == null) {
    throw new Error('buildMessages: userMessage is required and cannot be null or undefined');
  }

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: buildSystemMessage(session),
  };

  const historyMessages: ChatCompletionMessageParam[] = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const userMsg: ChatCompletionMessageParam = {
    role: 'user',
    content: userMessage,
  };

  return [systemMessage, ...historyMessages, userMsg];
}

/**
 * Build messages array for output generation (final 4-part result).
 * System message includes full scores breakdown, risk level, matched keywords,
 * perception, and instructions for generating the output parts.
 */
export function buildOutputMessages(
  context: OutputContext,
  history: Array<{ role: 'assistant' | 'user'; content: string }>,
): ChatCompletionMessageParam[] {
  if (context == null) {
    throw new Error('buildOutputMessages: context is required and cannot be null or undefined');
  }
  if (history == null) {
    throw new Error('buildOutputMessages: history is required and cannot be null or undefined');
  }

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: buildOutputSystemMessage(context),
  };

  const historyMessages: ChatCompletionMessageParam[] = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  return [systemMessage, ...historyMessages];
}

// --- Internal helpers (not exported) ---

function buildPersona(session: SessionContext): string {
  const isIndonesian = session.locale === 'id';
  const isPlayful = session.theme === 'playful';

  if (isIndonesian) {
    const tone = isPlayful
      ? 'Kamu adalah asisten skrining kesehatan yang ramah dan santai. Gunakan bahasa yang mudah dipahami dan nada yang hangat.'
      : 'Kamu adalah asisten skrining kesehatan yang profesional namun ramah. Gunakan bahasa yang jelas dan informatif.';
    return `${tone}\nNama kamu adalah SICAPS (Sistem Cerdas AI untuk Pemeriksaan Skabies). Tugasmu adalah melakukan skrining awal gejala skabies melalui percakapan. Jangan memberikan diagnosis medis — hanya skrining awal.`;
  }

  const tone = isPlayful
    ? 'You are a friendly and casual health screening assistant. Use easy-to-understand language and a warm tone.'
    : 'You are a professional yet approachable health screening assistant. Use clear and informative language.';
  return `${tone}\nYour name is SICAPS (Smart AI System for Scabies Screening). Your task is to conduct an initial scabies symptom screening through conversation. Do not provide medical diagnoses — only initial screening.`;
}

function buildSessionContext(session: SessionContext): string {
  const isIndonesian = session.locale === 'id';

  if (isIndonesian) {
    return [
      `[Konteks Sesi]`,
      `- Bahasa: Indonesia`,
      `- Usia responden: ${session.demographics.age} tahun`,
      `- Jenis kelamin: ${session.demographics.gender}`,
      `- Giliran percakapan: ${session.turn}`,
      `- Kategori sudah dibahas: ${session.categoriesCovered.length > 0 ? session.categoriesCovered.join(', ') : 'belum ada'}`,
      `- Kategori belum dibahas: ${session.categoriesRemaining.length > 0 ? session.categoriesRemaining.join(', ') : 'semua sudah dibahas'}`,
    ].join('\n');
  }

  return [
    `[Session Context]`,
    `- Language: English`,
    `- Respondent age: ${session.demographics.age} years`,
    `- Gender: ${session.demographics.gender}`,
    `- Conversation turn: ${session.turn}`,
    `- Categories covered: ${session.categoriesCovered.length > 0 ? session.categoriesCovered.join(', ') : 'none yet'}`,
    `- Categories remaining: ${session.categoriesRemaining.length > 0 ? session.categoriesRemaining.join(', ') : 'all covered'}`,
  ].join('\n');
}

function buildBackendInstruction(session: SessionContext): string {
  const isIndonesian = session.locale === 'id';

  const categories = ['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'];

  if (isIndonesian) {
    return [
      `[Instruksi Backend — WAJIB dipatuhi]`,
      `Respons HARUS dalam format JSON valid dengan struktur berikut:`,
      `{`,
      `  "reply": "<balasan percakapan untuk pengguna dalam Bahasa Indonesia>",`,
      `  "extraction": {`,
      ...categories.map(
        (cat) => `    "${cat}": [{"keyword": "<kata kunci>", "confidence": "high|medium|low"}]`,
      ),
      `  },`,
      `  "categories_covered": ["<kategori yang sudah dibahas di turn ini>"],`,
      `  "next_category": "<kategori berikutnya untuk ditanyakan, atau null>",`,
      `  "should_follow_up": <true jika perlu tanya lanjutan di kategori sama>`,
      `}`,
      ``,
      `Aturan:`,
      `- "reply" berisi respons percakapan natural untuk pengguna`,
      `- "extraction" berisi kata kunci yang diekstrak dari jawaban pengguna`,
      `- Hanya ekstrak kata kunci yang benar-benar disebutkan pengguna`,
      `- Jika tidak ada kata kunci relevan, gunakan array kosong []`,
      `- Arahkan percakapan ke kategori yang belum dibahas`,
    ].join('\n');
  }

  return [
    `[Backend Instruction — MUST be followed]`,
    `Response MUST be valid JSON with the following structure:`,
    `{`,
    `  "reply": "<conversational reply to the user in English>",`,
    `  "extraction": {`,
    ...categories.map(
      (cat) => `    "${cat}": [{"keyword": "<keyword>", "confidence": "high|medium|low"}]`,
    ),
    `  },`,
    `  "categories_covered": ["<categories discussed in this turn>"],`,
    `  "next_category": "<next category to ask about, or null>",`,
    `  "should_follow_up": <true if follow-up needed in same category>`,
    `}`,
    ``,
    `Rules:`,
    `- "reply" contains the natural conversational response for the user`,
    `- "extraction" contains keywords extracted from the user's answer`,
    `- Only extract keywords actually mentioned by the user`,
    `- If no relevant keywords, use empty array []`,
    `- Guide conversation toward uncovered categories`,
  ].join('\n');
}

/**
 * Build turn-specific guidance from the Chat Engine instruction.
 * Tells the LLM exactly what behavior is expected this turn:
 * follow-up, explore new category, redirect, etc.
 */
function buildTurnGuidance(session: SessionContext): string | null {
  if (!session.instruction) return null;

  const { type, targetCategory } = session.instruction;
  const isIndonesian = session.locale === 'id';

  switch (type) {
    case 'FOLLOW_UP':
      return isIndonesian
        ? `[Panduan Turn Ini]\nTanyakan pertanyaan klarifikasi spesifik tentang kategori "${targetCategory}". Pengguna sudah menyebutkan gejala tapi kurang detail. Minta konfirmasi atau detail tambahan dengan pertanyaan tertutup (ya/tidak) atau pilihan konkret.`
        : `[Turn Guidance]\nAsk a specific clarifying question about the "${targetCategory}" category. The user mentioned symptoms but lacked detail. Ask for confirmation or additional detail with a closed question (yes/no) or concrete choices.`;

    case 'EXPLORE_CATEGORY':
      return isIndonesian
        ? `[Panduan Turn Ini]\nArahkan percakapan ke kategori "${targetCategory}". Ajukan pertanyaan terbuka yang natural tentang kategori ini tanpa terasa seperti interogasi.`
        : `[Turn Guidance]\nGuide the conversation toward the "${targetCategory}" category. Ask a natural open-ended question about this category without feeling like an interrogation.`;

    case 'REDIRECT_ON_TOPIC':
      return isIndonesian
        ? `[Panduan Turn Ini]\nPengguna mengirim pesan yang tidak terkait skrining. Akui singkat dalam 1 kalimat, lalu arahkan kembali ke topik skrining kulit — tanyakan tentang kategori "${targetCategory ?? 'gejala kulit'}".`
        : `[Turn Guidance]\nThe user sent a message unrelated to screening. Acknowledge briefly in 1 sentence, then redirect back to skin screening — ask about the "${targetCategory ?? 'skin symptoms'}" category.`;

    case 'SHORT_ANSWER_FOLLOW_UP':
      return isIndonesian
        ? `[Panduan Turn Ini]\nPengguna memberikan jawaban sangat singkat. Ajukan pertanyaan yang lebih spesifik dengan pilihan konkret (misalnya skala 1-5, ya/tidak, atau opsi pilihan) tentang kategori "${targetCategory ?? 'gejala kulit'}".`
        : `[Turn Guidance]\nThe user gave a very short answer. Ask a more specific question with concrete choices (e.g., scale 1-5, yes/no, or multiple choice options) about the "${targetCategory ?? 'skin symptoms'}" category.`;

    case 'LONG_MESSAGE_CONFIRM':
      return isIndonesian
        ? `[Panduan Turn Ini]\nPengguna mengirim pesan panjang. Ekstrak kata kunci terkait 6 kategori skrining, abaikan informasi yang tidak relevan. Dalam "reply", buat ringkasan singkat dari poin-poin yang diekstrak dan minta pengguna konfirmasi.`
        : `[Turn Guidance]\nThe user sent a long message. Extract keywords related to the 6 screening categories, discard unrelated content. In "reply", summarize the extracted points briefly and ask the user to confirm.`;

    case 'SESSION_CLOSE_OFFER':
      return isIndonesian
        ? `[Panduan Turn Ini]\nPengguna sudah 3 kali berturut-turut mengirim pesan tidak terkait skrining. Tawarkan untuk mengakhiri sesi skrining dengan sopan, sambil menyebutkan bahwa mereka bisa kembali kapan saja.`
        : `[Turn Guidance]\nThe user has sent 3 consecutive off-topic messages. Politely offer to end the screening session, while mentioning they can return anytime.`;

    case 'COMPLETE':
      return null; // No guidance needed — output generation handles this

    default:
      return null;
  }
}

function buildOutputSystemMessage(context: OutputContext): string {
  const isIndonesian = context.locale === 'id';
  const isPlayful = context.theme === 'playful';

  const scoresBreakdown = Object.entries(context.scores)
    .map(([category, score]) => `  ${category}: ${score}`)
    .join('\n');

  const keywordsBreakdown = Object.entries(context.matchedKeywords)
    .map(
      ([category, keywords]) => `  ${category}: ${keywords.length > 0 ? keywords.join(', ') : '-'}`,
    )
    .join('\n');

  if (isIndonesian) {
    const tone = isPlayful
      ? 'Gunakan bahasa yang santai dan mudah dipahami.'
      : 'Gunakan bahasa yang profesional namun mudah dipahami.';

    return [
      `Kamu adalah SICAPS. Tugas kamu sekarang adalah membuat laporan hasil skrining berdasarkan data berikut. ${tone}`,
      ``,
      `[Data Skrining]`,
      `Tingkat risiko: ${context.riskLevel}`,
      ``,
      `Skor per kategori:`,
      scoresBreakdown,
      ``,
      `Kata kunci terdeteksi per kategori:`,
      keywordsBreakdown,
      ``,
      `Persepsi terdeteksi: ${context.perception ?? 'tidak terdeteksi'}`,
      ``,
      `[Instruksi]`,
      `Buat respons JSON valid dengan struktur:`,
      `{`,
      `  "conclusion": "<kesimpulan hasil skrining>",`,
      `  "perceptionResponse": "<respons terhadap persepsi pengguna, atau null jika tidak ada>",`,
      `  "recommendation": "<rekomendasi tindakan selanjutnya>",`,
      `  "personalizedSuggestion": "<saran personal berdasarkan jawaban, atau null>"`,
      `}`,
      ``,
      `Aturan:`,
      `- "conclusion" berisi ringkasan hasil skrining berdasarkan skor dan tingkat risiko`,
      `- "perceptionResponse" berisi respons jika ada persepsi (${context.perception ?? 'null'}), null jika tidak ada`,
      `- "recommendation" berisi saran tindakan sesuai tingkat risiko`,
      `- "personalizedSuggestion" berisi saran tambahan personal, atau null jika tidak relevan`,
    ].join('\n');
  }

  const tone = isPlayful
    ? 'Use casual, easy-to-understand language.'
    : 'Use professional yet accessible language.';

  return [
    `You are SICAPS. Your task now is to generate a screening result report based on the following data. ${tone}`,
    ``,
    `[Screening Data]`,
    `Risk level: ${context.riskLevel}`,
    ``,
    `Scores per category:`,
    scoresBreakdown,
    ``,
    `Matched keywords per category:`,
    keywordsBreakdown,
    ``,
    `Perception detected: ${context.perception ?? 'none detected'}`,
    ``,
    `[Instructions]`,
    `Generate a valid JSON response with the structure:`,
    `{`,
    `  "conclusion": "<screening result conclusion>",`,
    `  "perceptionResponse": "<response to user perception, or null if none>",`,
    `  "recommendation": "<recommended next steps>",`,
    `  "personalizedSuggestion": "<personalized suggestion based on answers, or null>"`,
    `}`,
    ``,
    `Rules:`,
    `- "conclusion" contains a summary of screening results based on scores and risk level`,
    `- "perceptionResponse" responds to detected perception (${context.perception ?? 'null'}), null if none`,
    `- "recommendation" contains action suggestions appropriate to the risk level`,
    `- "personalizedSuggestion" contains additional personal advice, or null if not relevant`,
  ].join('\n');
}
