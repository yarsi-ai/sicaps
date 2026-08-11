'use client';

import { useCallback, useState } from 'react';
import { usePlaygroundContext } from './PlaygroundContext';

const THEMES = [
  { value: 'hybrid' as const, label: 'Hybrid' },
  { value: 'playful' as const, label: 'Playful' },
];

const LOCALES = [
  { value: 'id' as const, label: 'Indonesian (id)' },
  { value: 'en' as const, label: 'English (en)' },
];

/**
 * Persona selector — Theme + Locale dropdowns that trigger prompt auto-generation.
 * Placed in ConfigPanel above the system prompt editor (non-compact mode only).
 */
export function PersonaSelector() {
  const { state, updatePersona } = usePlaygroundContext();
  const [loading, setLoading] = useState(false);

  const handleThemeChange = useCallback(
    async (theme: 'playful' | 'hybrid') => {
      setLoading(true);
      try {
        await updatePersona(theme, state.persona.locale);
      } finally {
        setLoading(false);
      }
    },
    [state.persona.locale, updatePersona],
  );

  const handleLocaleChange = useCallback(
    async (locale: 'id' | 'en') => {
      setLoading(true);
      try {
        await updatePersona(state.persona.theme, locale);
      } finally {
        setLoading(false);
      }
    },
    [state.persona.theme, updatePersona],
  );

  const labelClass =
    'block text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a9285] mb-1.5';
  const selectClass =
    'w-full appearance-none rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[12px] text-[#4a4035] shadow-sm focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30 disabled:opacity-50';

  return (
    <fieldset disabled={loading}>
      <label className={labelClass}>Persona</label>
      <div className="flex gap-2">
        <div className="flex-1">
          <select
            value={state.persona.theme}
            onChange={(e) => handleThemeChange(e.target.value as 'playful' | 'hybrid')}
            className={selectClass}
            aria-label="Theme"
          >
            {THEMES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <select
            value={state.persona.locale}
            onChange={(e) => handleLocaleChange(e.target.value as 'id' | 'en')}
            className={selectClass}
            aria-label="Locale"
          >
            {LOCALES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}
