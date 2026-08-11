import type {
  PoolEntry,
  CategoryExtraction,
  KeywordPool,
  PillSelection,
  CategoryName,
} from '@/features/screening-chat-v1/internal';

export function buildPoolEntry(overrides: Partial<PoolEntry> = {}): PoolEntry {
  return {
    keyword: 'gatal',
    confidence: 'high',
    turn: 1,
    matched: false,
    matchedPattern: null,
    ...overrides,
  };
}

function emptyCategories<T>(): Record<CategoryName, T[]> {
  return {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
  };
}

export function buildExtraction(overrides: Partial<CategoryExtraction> = {}): CategoryExtraction {
  return {
    ...emptyCategories(),
    ...overrides,
  };
}

export function buildKeywordPool(overrides: Partial<KeywordPool> = {}): KeywordPool {
  return {
    ...emptyCategories(),
    ...overrides,
  };
}

export function buildPillSelection(overrides: Partial<PillSelection> = {}): PillSelection {
  return {
    pillId: 'pill-1',
    category: 'intensitas',
    ...overrides,
  };
}
