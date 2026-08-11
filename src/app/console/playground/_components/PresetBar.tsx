'use client';

import { useState, useRef, useEffect } from 'react';
import { usePlaygroundContext } from './PlaygroundContext';

/**
 * Preset management bar: Save, Load, Delete presets.
 * Full implementation in task 4.3.
 */
export function PresetBar() {
  const { savePreset, loadPreset, deletePreset, listPresets } = usePlaygroundContext();
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [presetName, setPresetName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const presets = listPresets();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowLoad(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!presetName.trim()) return;
    savePreset(presetName.trim());
    setPresetName('');
    setShowSave(false);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Save button / inline form */}
      {showSave ? (
        <form onSubmit={handleSave} className="flex items-center gap-1.5">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Nama preset..."
            autoFocus
            className="w-32 rounded-md border border-[#e2ddd0] bg-white px-2 py-1 text-[10px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!presetName.trim()}
            className="rounded-md bg-[#4a4035] px-2 py-1 text-[10px] font-medium text-[#f4f1ea] disabled:opacity-30"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setShowSave(false)}
            className="text-[10px] text-[#8a7e6f] hover:text-[#4a4035]"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowSave(true)}
          className="rounded-md border border-[#e2ddd0] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6b5e4f] transition hover:border-[#cfc9bd] hover:bg-[#f7f4ee]"
        >
          Save Preset
        </button>
      )}

      {/* Load dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowLoad(!showLoad)}
          aria-expanded={showLoad}
          aria-haspopup="true"
          className="rounded-md border border-[#e2ddd0] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6b5e4f] transition hover:border-[#cfc9bd] hover:bg-[#f7f4ee]"
        >
          Load <span className="text-[8px] text-[#b9b2a3]">▾</span>
        </button>
        {showLoad && (
          <div
            role="menu"
            className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-lg border border-[#e2ddd0] bg-white py-1 shadow-lg"
          >
            {/* Default (Production) preset */}
            <button
              role="menuitem"
              onClick={() => {
                loadPreset('__default__');
                setShowLoad(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[10px] text-[#4a4035] transition hover:bg-[#f7f4ee]"
            >
              <span className="font-medium">Default (Production)</span>
              <span className="text-[8px] text-[#b9b2a3]">readonly</span>
            </button>

            {presets.length > 0 && <div className="my-1 border-t border-[#e2ddd0]" />}

            {presets.map((preset) => (
              <div
                key={preset.name}
                className="flex items-center justify-between px-3 py-2 text-[10px] text-[#4a4035] hover:bg-[#f7f4ee]"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    loadPreset(preset.name);
                    setShowLoad(false);
                  }}
                  className="flex-1 text-left"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => deletePreset(preset.name)}
                  className="ml-2 text-[9px] text-red-400 hover:text-red-600"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  ✕
                </button>
              </div>
            ))}

            {presets.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-[#b9b2a3]">No saved presets</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
