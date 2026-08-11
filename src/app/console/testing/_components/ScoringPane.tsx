'use client';

import { useTestingContext } from './TestingContext';

const RISK_COLORS: Record<string, string> = {
  HIGH: 'text-red-600',
  MODERATE: 'text-[#d9a319]',
  LOW: 'text-emerald-600',
};

const RISK_BG: Record<string, string> = {
  HIGH: 'bg-red-50 border-red-200',
  MODERATE: 'bg-yellow-50 border-yellow-200',
  LOW: 'bg-emerald-50 border-emerald-200',
};

const _CHIPS_LABELS: Record<string, string> = {
  kontak: 'Kontak',
  lokasi: 'Lokasi',
  asrama: 'Asrama',
  tukar_alat: 'Tukar Alat',
};

export function ScoringPane() {
  const { state } = useTestingContext();

  if (!state.sessionId) {
    return (
      <aside className="h-full border-l border-[#cfc9bd] bg-[#fcfbf7] p-5">
        <p className="text-[11px] text-[#b9b2a3]">Scoring detail appears here</p>
      </aside>
    );
  }

  const scoringState = state.binaryScoringState;
  const riskLevel = state.binaryRiskLevel;
  const _chipsAnswered = state.chipsAnswered;
  const dimensiTerisi = state.dimensiTerisi;
  const dimensiBelum = state.dimensiBelum;
  const dimensiDetail = state.dimensiDetail;
  const perception = state.perception;

  const indicators = [
    { key: 'gatalMalam', label: 'Gatal Malam', value: scoringState?.gatalMalam ?? false },
    { key: 'kontakSerupa', label: 'Kontak Serupa', value: scoringState?.kontakSerupa ?? false },
    { key: 'lokasiKhas', label: 'Lokasi Khas', value: scoringState?.lokasiKhas ?? false },
    { key: 'asrama', label: 'Asrama', value: scoringState?.asrama ?? false },
    { key: 'tukarAlat', label: 'Tukar Alat', value: scoringState?.tukarAlat ?? false },
  ];

  const gejalaCount = indicators.slice(0, 3).filter((i) => i.value).length;
  const faktorCount = indicators.slice(3).filter((i) => i.value).length;

  return (
    <aside className="h-full overflow-y-auto border-l border-[#cfc9bd] bg-[#fcfbf7]">
      {/* 1. Computed Risk Level */}
      <div className="border-b border-[#e2ddd0] p-4">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
          Computed Risk Level
        </p>
        {riskLevel ? (
          <div
            className={`rounded-lg border p-3 ${RISK_BG[riskLevel] ?? 'bg-[#f7f4ee] border-[#e2ddd0]'}`}
          >
            <span className={`text-sm font-black ${RISK_COLORS[riskLevel] ?? 'text-[#4a4035]'}`}>
              {riskLevel}
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3">
            <span className="text-[11px] text-[#b9b2a3]">Not yet computed</span>
          </div>
        )}
      </div>

      {/* 2. Binary Scoring State */}
      <div className="border-b border-[#e2ddd0] p-4">
        <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
          Binary Scoring State
        </p>

        {/* Gejala Kunci */}
        <p className="mb-1.5 text-[9px] font-semibold text-[#6b5e4f]">Gejala Kunci (3)</p>
        <div className="mb-3 space-y-1">
          {indicators.slice(0, 3).map(({ key, label, value }) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`text-sm ${value ? 'text-emerald-500' : 'text-[#dcd6c8]'}`}>
                {value ? '●' : '○'}
              </span>
              <span
                className={`text-[11px] ${value ? 'font-semibold text-[#4a4035]' : 'text-[#b9b2a3]'}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Faktor Tambahan */}
        <p className="mb-1.5 text-[9px] font-semibold text-[#6b5e4f]">Faktor Tambahan (2)</p>
        <div className="space-y-1">
          {indicators.slice(3).map(({ key, label, value }) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`text-sm ${value ? 'text-emerald-500' : 'text-[#dcd6c8]'}`}>
                {value ? '●' : '○'}
              </span>
              <span
                className={`text-[11px] ${value ? 'font-semibold text-[#4a4035]' : 'text-[#b9b2a3]'}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Summary counts */}
        <div className="mt-3 flex gap-3 text-[10px] text-[#8a8070]">
          <span>
            Gejala: <span className="font-bold text-[#4a4035]">{gejalaCount}/3</span>
          </span>
          <span>
            Faktor: <span className="font-bold text-[#4a4035]">{faktorCount}/2</span>
          </span>
        </div>
      </div>

      {/* 3. Dimension Coverage */}
      <div className="border-b border-[#e2ddd0] p-4">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
          Dimension Coverage
        </p>
        <div className="space-y-1">
          {['intensitas', 'waktu', 'lokasi_tubuh', 'kontak', 'lesi', 'faktor_risiko'].map((dim) => {
            const filled = dimensiTerisi.includes(dim);
            const detail = dimensiDetail[dim];
            const keywords = detail?.keywords ?? [];
            const negasi = detail?.negasi ?? [];
            return (
              <div key={dim} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${filled ? 'text-emerald-500' : 'text-[#dcd6c8]'}`}>
                    {filled ? '●' : '○'}
                  </span>
                  <span
                    className={`text-[11px] ${filled ? 'font-semibold text-[#4a4035]' : 'text-[#b9b2a3]'}`}
                  >
                    {dim}
                  </span>
                </div>
                {(keywords.length > 0 || negasi.length > 0) && (
                  <div className="ml-6 flex flex-wrap gap-1">
                    {keywords.map((kw, i) => (
                      <span
                        key={`k-${i}`}
                        className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700"
                      >
                        {kw}
                      </span>
                    ))}
                    {negasi.map((neg, i) => (
                      <span
                        key={`n-${i}`}
                        className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] text-red-600"
                      >
                        ✗ {neg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[10px] text-[#8a8070]">
          Terisi: <span className="font-bold text-[#4a4035]">{dimensiTerisi.length}/6</span> Belum:{' '}
          <span className="font-bold text-[#4a4035]">{dimensiBelum.length}</span>
        </div>
      </div>

      {/* 5. Perception */}
      <div className="p-4">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
          Perception
        </p>
        {perception ? (
          <span
            className={`rounded px-2 py-1 text-[11px] font-semibold ${
              perception === 'BARRIER'
                ? 'bg-orange-50 text-orange-700'
                : perception === 'OVERESTIMATE'
                  ? 'bg-red-50 text-red-600'
                  : perception === 'UNDERESTIMATE'
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {perception}
          </span>
        ) : (
          <span className="text-[11px] text-[#b9b2a3]">Belum terdeteksi</span>
        )}
      </div>
    </aside>
  );
}
