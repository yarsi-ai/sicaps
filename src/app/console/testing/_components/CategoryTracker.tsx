'use client';

import { useTestingContext } from './TestingContext';
import { CONFIG } from '@/lib/config';

const CATEGORIES = CONFIG.scoringCategories;

export function CategoryTracker() {
  const { state } = useTestingContext();
  const covered = state.scoring?.categoriesCovered ?? [];
  const scores = state.categoryScores;

  return (
    <div className="border-b border-[#e2ddd0] p-4">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
        Category Tracker
      </p>
      <div className="space-y-1">
        {CATEGORIES.map((cat) => {
          const isCovered = covered.includes(cat);
          const score = scores?.[cat] ?? null;
          return (
            <div key={cat} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isCovered ? 'bg-emerald-400' : 'bg-[#dcd6c8]'}`}
              />
              <span
                className={`text-[11px] ${isCovered ? 'font-semibold text-[#4a4035]' : 'text-[#b9b2a3]'}`}
              >
                {cat}
              </span>
              <span className="ml-auto text-[11px]">
                {isCovered && score !== null ? (
                  <span className="font-bold text-emerald-600">+{score}</span>
                ) : (
                  <span className="text-[#cfc9bd]">—</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
