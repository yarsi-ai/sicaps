/** Shape of the LLM output response (4-part result) */
interface LLMOutputResponse {
  conclusion: string;
  perceptionResponse: string | null;
  recommendation: string;
  personalizedSuggestion: string | null;
}

export type FallbackLocale = 'id' | 'en';
export type FallbackRiskLevel = 'HIGH' | 'MODERATE' | 'LOW';

const TEMPLATES: Record<
  FallbackLocale,
  Record<FallbackRiskLevel, { conclusion: string; recommendation: string }>
> = {
  id: {
    HIGH: {
      conclusion:
        'Berdasarkan hasil skrining, terdapat indikasi kuat adanya gejala yang konsisten dengan skabies. Gejala yang Anda alami memerlukan perhatian medis segera.',
      recommendation:
        'Segera konsultasikan kondisi Anda ke dokter atau petugas kesehatan terdekat untuk pemeriksaan dan pengobatan lebih lanjut. Hindari berbagi handuk, pakaian, atau tempat tidur dengan orang lain untuk mencegah penularan.',
    },
    MODERATE: {
      conclusion:
        'Berdasarkan hasil skrining, terdapat beberapa gejala yang perlu diperhatikan lebih lanjut. Belum dapat dipastikan apakah ini skabies atau kondisi kulit lainnya.',
      recommendation:
        'Disarankan untuk memantau perkembangan gejala dan berkonsultasi dengan dokter atau petugas kesehatan jika gejala bertambah parah atau tidak membaik dalam beberapa hari. Jaga kebersihan diri dan lingkungan.',
    },
    LOW: {
      conclusion:
        'Berdasarkan hasil skrining, gejala yang Anda alami kemungkinan besar bukan skabies. Kondisi kulit Anda tampak dalam batas normal.',
      recommendation:
        'Tetap jaga kebersihan diri dengan mandi teratur, mengganti pakaian setiap hari, dan menjaga kebersihan tempat tidur. Jika muncul gejala baru seperti gatal hebat terutama di malam hari, segera periksakan ke petugas kesehatan.',
    },
  },
  en: {
    HIGH: {
      conclusion:
        'Based on the screening results, there is a strong indication of symptoms consistent with scabies. Your symptoms require immediate medical attention.',
      recommendation:
        'Please consult a doctor or healthcare worker as soon as possible for examination and treatment. Avoid sharing towels, clothing, or bedding with others to prevent transmission.',
    },
    MODERATE: {
      conclusion:
        'Based on the screening results, there are some symptoms that need further observation. It cannot yet be determined whether this is scabies or another skin condition.',
      recommendation:
        'Monitor your symptoms and consult a doctor or healthcare worker if they worsen or do not improve within a few days. Maintain good personal hygiene and keep your environment clean.',
    },
    LOW: {
      conclusion:
        'Based on the screening results, your symptoms are most likely not scabies. Your skin condition appears to be within normal limits.',
      recommendation:
        'Continue practicing good hygiene by bathing regularly, changing clothes daily, and keeping your bedding clean. If new symptoms appear, such as intense itching especially at night, seek medical attention promptly.',
    },
  },
};

/**
 * Returns static output template when LLM is unavailable for output generation.
 * perceptionResponse and personalizedSuggestion are always null in templates.
 */
export function getFallbackOutput(
  locale: FallbackLocale,
  riskLevel: FallbackRiskLevel,
): LLMOutputResponse {
  const template = TEMPLATES[locale][riskLevel];

  return {
    conclusion: template.conclusion,
    perceptionResponse: null,
    recommendation: template.recommendation,
    personalizedSuggestion: null,
  };
}
