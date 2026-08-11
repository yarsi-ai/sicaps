'use client';

import type { PlaygroundConfig, PlaygroundProvider } from './PlaygroundContext';
import { usePlaygroundContext } from './PlaygroundContext';
import { getDefaultModel } from '@/lib/llm/playground-client';
import { PersonaSelector } from './PersonaSelector';
import { PromptStatusIndicator } from './PromptStatusIndicator';

export interface ConfigPanelProps {
  config: PlaygroundConfig;
  onUpdateConfig: (partial: Partial<PlaygroundConfig>) => void;
  /** When true, renders a compact version for compare mode panels */
  compact?: boolean;
}

const PROVIDERS: Array<{ value: PlaygroundProvider; label: string }> = [
  { value: 'groq', label: 'Groq' },
  { value: 'huggingface', label: 'HuggingFace' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' },
];

/**
 * Configuration panel for provider, model, generation parameters, and system prompt.
 * All changes are reflected immediately via onUpdateConfig callback.
 */
export function ConfigPanel({ config, onUpdateConfig, compact }: ConfigPanelProps) {
  const { markPromptEdited } = usePlaygroundContext();

  function handleProviderChange(provider: PlaygroundProvider): void {
    onUpdateConfig({ provider, model: getDefaultModel(provider) });
  }

  function handleSystemPromptChange(value: string): void {
    onUpdateConfig({ systemPrompt: value });
    markPromptEdited();
  }

  const spacing = compact ? 'p-4 space-y-3' : 'p-5 space-y-4';
  const labelClass =
    'block text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a9285] mb-1.5';

  return (
    <div className={spacing}>
      {/* Provider */}
      <fieldset>
        <label className={labelClass}>Provider</label>
        <select
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value as PlaygroundProvider)}
          className="w-full appearance-none rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[12px] text-[#4a4035] shadow-sm focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30"
        >
          {PROVIDERS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </fieldset>

      {/* Model */}
      <fieldset>
        <label className={labelClass}>Model</label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => onUpdateConfig({ model: e.target.value })}
          placeholder={getDefaultModel(config.provider)}
          className="w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[12px] text-[#4a4035] shadow-sm placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30"
        />
      </fieldset>

      {/* Temperature */}
      <fieldset>
        <label className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a9285]">
            Temperature
          </span>
          <span className="rounded bg-[#f0ede6] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4a4035]">
            {config.temperature.toFixed(2)}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={config.temperature}
          onChange={(e) => onUpdateConfig({ temperature: parseFloat(e.target.value) })}
          className="playground-slider w-full"
        />
      </fieldset>

      {/* Top P */}
      <fieldset>
        <label className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a9285]">
            Top P
          </span>
          <span className="rounded bg-[#f0ede6] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4a4035]">
            {config.topP.toFixed(2)}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={config.topP}
          onChange={(e) => onUpdateConfig({ topP: parseFloat(e.target.value) })}
          className="playground-slider w-full"
        />
      </fieldset>

      {/* Max Tokens */}
      <fieldset>
        <label className={labelClass}>Max Tokens</label>
        <input
          type="number"
          min="1"
          max="4096"
          value={config.maxTokens}
          onChange={(e) =>
            onUpdateConfig({
              maxTokens: Math.max(1, Math.min(4096, parseInt(e.target.value) || 1)),
            })
          }
          className="w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[12px] text-[#4a4035] shadow-sm focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30"
        />
      </fieldset>

      {/* Persona Selector + Prompt Status + System Prompt */}
      {compact ? (
        <details className="group">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a9285] hover:text-[#6b5e4f]">
            System Prompt ▾
          </summary>
          <textarea
            value={config.systemPrompt}
            onChange={(e) => handleSystemPromptChange(e.target.value)}
            placeholder="Enter system prompt..."
            rows={3}
            className="mt-1.5 w-full resize-y rounded-md border border-[#e2ddd0] bg-white px-3 py-2 font-mono text-[10px] leading-relaxed text-[#4a4035] shadow-sm placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30"
          />
        </details>
      ) : (
        <div className="space-y-3">
          {/* Persona Selector — above system prompt */}
          <PersonaSelector />

          {/* Prompt Status Indicator — between persona and editor */}
          <PromptStatusIndicator />

          {/* System Prompt Editor */}
          <fieldset>
            <label className={labelClass}>System Prompt</label>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => handleSystemPromptChange(e.target.value)}
              placeholder="Enter system prompt..."
              rows={5}
              className="w-full resize-y rounded-md border border-[#e2ddd0] bg-white px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#4a4035] shadow-sm placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none focus:ring-1 focus:ring-[#d9a319]/30"
            />
          </fieldset>
        </div>
      )}
    </div>
  );
}
