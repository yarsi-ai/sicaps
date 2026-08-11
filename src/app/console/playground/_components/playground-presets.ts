import { type PlaygroundConfig, type PresetEntry, PRESETS_STORAGE_KEY } from './PlaygroundContext';

interface PresetStorage {
  version: 1;
  presets: PresetEntry[];
}

function readStorage(): PresetStorage {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return { version: 1, presets: [] };
    const parsed = JSON.parse(raw) as PresetStorage;
    if (parsed.version !== 1 || !Array.isArray(parsed.presets)) {
      return { version: 1, presets: [] };
    }
    return parsed;
  } catch {
    return { version: 1, presets: [] };
  }
}

function writeStorage(storage: PresetStorage): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(storage));
}

export function savePreset(name: string, config: PlaygroundConfig): void {
  const storage = readStorage();
  const existing = storage.presets.findIndex((p) => p.name === name);
  const entry: PresetEntry = {
    name,
    config: { ...config },
    createdAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    storage.presets[existing] = entry;
  } else {
    storage.presets.push(entry);
  }
  writeStorage(storage);
}

export function loadPreset(name: string): PlaygroundConfig | undefined {
  const storage = readStorage();
  const entry = storage.presets.find((p) => p.name === name);
  return entry?.config;
}

export function deletePreset(name: string): void {
  const storage = readStorage();
  storage.presets = storage.presets.filter((p) => p.name !== name);
  writeStorage(storage);
}

export function listPresets(): PresetEntry[] {
  return readStorage().presets;
}
