import type { EducationLevel, ToneTheme } from '../types';

/**
 * Map education level to tone theme.
 *
 * SD → playful (emoji, short, fun)
 * SMP/SMA → hybrid (casual but informative)
 * null/unknown → hybrid (default)
 */
export function determineToneTheme(educationLevel: EducationLevel | null): ToneTheme {
  if (educationLevel === 'ELEMENTARY') return 'playful';
  return 'hybrid';
}

/**
 * Build tone directive string for LLM compose system prompt.
 */
export function buildToneDirective(theme: ToneTheme): string {
  if (theme === 'playful') {
    return [
      'GAYA BAHASA: Playful (SD)',
      '- Gunakan emoji secara natural (1-2 per pesan)',
      '- Kalimat pendek dan simpel',
      '- Bahasa gaul anak-anak: "keren!", "yuk", "asyik", "seru"',
      '- Hindari istilah medis — gunakan kata sehari-hari',
      '- Panggil user dengan cara yang ramah dan ceria',
    ].join('\n');
  }
  return [
    'GAYA BAHASA: Hybrid (SMP/SMA)',
    '- Santai tapi informatif',
    '- Boleh pakai istilah kesehatan sederhana + penjelasan singkat',
    '- Sesekali emoji OK tapi tidak berlebihan',
    '- Tone: supportive, casual, tidak menggurui',
  ].join('\n');
}
