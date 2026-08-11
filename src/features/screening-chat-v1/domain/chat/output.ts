import { SCORING_CONFIG, type SupportedLocale, type RiskLevel } from '../config';
import type { CategoryName } from '../keywords/types';
import type { Perception, OutputContext, FallbackOutput } from '../types';

const ALL_CATEGORIES: CategoryName[] = [...SCORING_CONFIG.categories];

// ─── Fallback Templates ───

const FALLBACK_TEMPLATES: Record<RiskLevel, Record<SupportedLocale, FallbackOutput>> = {
  HIGH: {
    id: {
      kesimpulan:
        'Berdasarkan skrining, risiko skabies Anda tergolong tinggi. Gejala yang Anda laporkan menunjukkan kemungkinan besar adanya infestasi skabies yang memerlukan penanganan medis segera.',
      persepsi: null,
      rekomendasi:
        'Segera kunjungi fasilitas kesehatan untuk mendapatkan diagnosis dan pengobatan. Hindari berbagi barang pribadi seperti handuk, pakaian, dan seprai dengan orang lain. Jaga kebersihan diri dan lingkungan. Cuci seprai, handuk, dan pakaian dengan air panas secara rutin.',
      saranPenanganan: null,
    },
    en: {
      kesimpulan:
        'Based on screening, your scabies risk is high. The symptoms you reported indicate a strong likelihood of scabies infestation requiring immediate medical attention.',
      persepsi: null,
      rekomendasi:
        'Seek healthcare immediately for diagnosis and treatment. Avoid sharing personal items such as towels, clothing, and bedsheets with others. Maintain personal and environmental hygiene. Wash bedsheets, towels, and clothing in hot water regularly.',
      saranPenanganan: null,
    },
  },
  MODERATE: {
    id: {
      kesimpulan:
        'Berdasarkan skrining, risiko skabies Anda tergolong sedang. Beberapa gejala yang Anda laporkan konsisten dengan kemungkinan skabies, namun diperlukan evaluasi lebih lanjut.',
      persepsi: null,
      rekomendasi:
        'Pantau gejala Anda secara rutin. Konsultasikan ke tenaga kesehatan jika gejala bertambah parah atau tidak membaik. Jaga kebersihan diri dan lingkungan. Hindari berbagi barang pribadi dengan orang lain.',
      saranPenanganan: null,
    },
    en: {
      kesimpulan:
        'Based on screening, your scabies risk is moderate. Some symptoms you reported are consistent with possible scabies, but further evaluation is needed.',
      persepsi: null,
      rekomendasi:
        'Monitor your symptoms regularly. Consult a healthcare provider if symptoms worsen or do not improve. Maintain personal and environmental hygiene. Avoid sharing personal items with others.',
      saranPenanganan: null,
    },
  },
  LOW: {
    id: {
      kesimpulan:
        'Berdasarkan skrining, risiko skabies Anda tergolong rendah. Gejala yang Anda laporkan tidak menunjukkan indikasi kuat adanya skabies.',
      persepsi: null,
      rekomendasi:
        'Jaga kebersihan diri dan lingkungan secara rutin. Tetap pantau kondisi kulit Anda. Konsultasikan ke tenaga kesehatan jika muncul gejala baru seperti gatal yang bertambah parah terutama di malam hari.',
      saranPenanganan: null,
    },
    en: {
      kesimpulan:
        'Based on screening, your scabies risk is low. The symptoms you reported do not strongly indicate scabies.',
      persepsi: null,
      rekomendasi:
        'Maintain personal and environmental hygiene regularly. Continue monitoring your skin condition. Consult a healthcare provider if new symptoms appear, especially itching that worsens at night.',
      saranPenanganan: null,
    },
  },
};

// ─── Base Recommendation Templates ───

const BASE_RECOMMENDATIONS: Record<RiskLevel, Record<SupportedLocale, string>> = {
  HIGH: {
    id: 'Segera kunjungi fasilitas kesehatan untuk mendapatkan diagnosis dan pengobatan. Hindari berbagi barang pribadi seperti handuk, pakaian, dan seprai. Jaga kebersihan diri dan lingkungan. Cuci seprai, handuk, dan pakaian dengan air panas secara rutin.',
    en: 'Seek healthcare immediately for diagnosis and treatment. Avoid sharing personal items such as towels, clothing, and bedsheets. Maintain personal and environmental hygiene. Wash bedsheets, towels, and clothing in hot water regularly.',
  },
  MODERATE: {
    id: 'Pantau gejala Anda secara rutin. Konsultasikan ke tenaga kesehatan jika gejala bertambah parah atau tidak membaik. Jaga kebersihan diri dan lingkungan. Hindari berbagi barang pribadi dengan orang lain.',
    en: 'Monitor your symptoms regularly. Consult a healthcare provider if symptoms worsen or do not improve. Maintain personal and environmental hygiene. Avoid sharing personal items with others.',
  },
  LOW: {
    id: 'Jaga kebersihan diri dan lingkungan secara rutin. Tetap pantau kondisi kulit Anda. Konsultasikan ke tenaga kesehatan jika muncul gejala baru.',
    en: 'Maintain personal and environmental hygiene regularly. Continue monitoring your skin condition. Consult a healthcare provider if new symptoms appear.',
  },
};

// ─── Public Functions ───

/**
 * Assembles full `OutputContext` from session data.
 * Computes `categoriesNotAssessed` as the set difference of all 6 categories minus `categoriesAssessed`.
 */
export function buildOutputContext(params: {
  riskLevel: RiskLevel;
  perception: Perception;
  locale: SupportedLocale;
  theme: 'playful' | 'hybrid';
  categoriesAssessed: CategoryName[];
  matchedKeywords: Record<CategoryName, string[]>;
  scores: Record<CategoryName, number>;
  totalScore: number;
  isForceClose: boolean;
}): OutputContext {
  const categoriesNotAssessed = ALL_CATEGORIES.filter(
    (cat) => !params.categoriesAssessed.includes(cat),
  );

  return {
    riskLevel: params.riskLevel,
    perception: params.perception,
    locale: params.locale,
    theme: params.theme,
    categoriesAssessed: params.categoriesAssessed,
    categoriesNotAssessed,
    isForceClose: params.isForceClose,
    matchedKeywords: params.matchedKeywords,
    scores: params.scores,
    totalScore: params.totalScore,
  };
}

/**
 * Returns static `FallbackOutput` for the given risk level and locale.
 * 6 combinations: 3 risk levels × 2 locales.
 */
export function getFallbackTemplate(riskLevel: RiskLevel, locale: SupportedLocale): FallbackOutput {
  return FALLBACK_TEMPLATES[riskLevel][locale];
}

/**
 * Returns the base recommendation template text for the given risk level and locale.
 * The LLM must preserve key action points from this template when paraphrasing.
 *
 * Key action points per risk level:
 * - HIGH: seek healthcare, avoid sharing personal items, maintain hygiene, wash bedsheets
 * - MODERATE: monitor symptoms, consult healthcare if worsens, maintain hygiene, avoid sharing items
 * - LOW: maintain hygiene, continue monitoring, consult if new symptoms appear
 */
export function getBaseRecommendationTemplate(
  riskLevel: RiskLevel,
  locale: SupportedLocale,
): string {
  return BASE_RECOMMENDATIONS[riskLevel][locale];
}
