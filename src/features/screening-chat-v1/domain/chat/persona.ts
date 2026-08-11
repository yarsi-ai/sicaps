import type { SupportedLocale } from '../config';
import type { EducationLevelInput, PersonaRules, Theme } from '../types';

/**
 * Selects the persona theme based on education level.
 * Elementary → playful; all others (including undefined) → hybrid.
 */
export function selectTheme(educationLevel: EducationLevelInput | undefined): Theme {
  return educationLevel === 'elementary' ? 'playful' : 'hybrid';
}

/**
 * Returns full persona rules for the given theme and locale.
 */
export function getPersonaRules(theme: Theme, locale: SupportedLocale): PersonaRules {
  if (theme === 'playful') {
    return {
      theme: 'playful',
      pronounSelf: locale === 'id' ? 'Aku' : 'I',
      pronounUser: locale === 'id' ? 'kamu' : 'you',
      maxWordsPerSentence: 15,
      emojiRange: [1, 2],
      vocabularyLevel: 'everyday',
      allowMedicalTerms: false,
    };
  }

  return {
    theme: 'hybrid',
    pronounSelf: locale === 'id' ? 'Saya' : 'I',
    pronounUser: locale === 'id' ? 'kamu' : 'you',
    maxWordsPerSentence: 25,
    emojiRange: [0, 1],
    vocabularyLevel: 'semi-formal',
    allowMedicalTerms: true,
  };
}
