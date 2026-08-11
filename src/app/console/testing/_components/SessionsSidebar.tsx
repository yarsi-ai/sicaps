'use client';

import { useState, useEffect } from 'react';
import { useTestingContext, type SessionProfile, type SessionListItem } from './TestingContext';

const PRESETS: Array<SessionProfile & { label: string }> = [
  {
    label: 'Santri Muda 12·SD',
    age: 12,
    gender: 'male',
    educationLevel: 'ELEMENTARY',
    locale: 'id',
  },
  {
    label: 'Santri Remaja 16·SMP',
    age: 16,
    gender: 'male',
    educationLevel: 'JUNIOR_HIGH',
    locale: 'id',
  },
];

export function SessionsSidebar() {
  const { state, createSession, reconnectSession, loadSessions, reset } = useTestingContext();
  const [showCustom, setShowCustom] = useState(false);
  const [pasteId, setPasteId] = useState('');
  const [age, setAge] = useState(16);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [edu, setEdu] = useState<SessionProfile['educationLevel']>('JUNIOR_HIGH');
  const [locale, setLocale] = useState<'id' | 'en'>('id');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handlePreset = async (preset: SessionProfile) => {
    setLoading(true);
    await createSession(preset);
    setLoading(false);
  };

  const handleCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await createSession({ age, gender, educationLevel: edu, locale });
    setLoading(false);
    setShowCustom(false);
  };

  const handlePasteReconnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteId.trim()) return;
    setLoading(true);
    await reconnectSession(pasteId.trim());
    setPasteId('');
    setLoading(false);
  };

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-r border-[#cfc9bd] bg-[#fcfbf7] p-4">
      {/* Sessions header */}
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#8a8070]">Sessions</h2>

      {/* Quick Create */}
      <div className="space-y-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#b9b2a3]">
          Quick Create
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p)}
            disabled={loading}
            className="flex w-full items-center gap-1.5 rounded-lg border border-[#d4ddea] bg-[#eef2f7] px-3 py-2 text-left text-[11px] font-medium text-[#4a5568] transition hover:border-[#a8c0e0] hover:bg-[#e1ebf7] disabled:opacity-40"
          >
            <span className="text-[#6b8ab8]">+</span> {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-[#b9b2a3] bg-[#f4f1ea] px-3 py-2 text-left text-[11px] text-[#8a8070] transition hover:border-[#9a9285] hover:bg-[#edeae3]"
        >
          <span className="text-[#b9b2a3]">+</span> Custom...
        </button>
      </div>

      {/* Custom session popup */}
      {showCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-[#cfc9bd] bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-[14px] font-bold text-[#4a4035]">Custom Session</h3>
              <button
                onClick={() => setShowCustom(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#b9b2a3] transition hover:bg-[#f7f4ee] hover:text-[#4a4035]"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCustom} className="px-5 pb-5">
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                    Age
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={99}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[11px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none"
                    placeholder="6 — 99"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                    className="mt-1 w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[11px] text-[#4a4035]"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                    Education Level
                  </label>
                  <select
                    value={edu}
                    onChange={(e) => setEdu(e.target.value as SessionProfile['educationLevel'])}
                    className="mt-1 w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[11px] text-[#4a4035]"
                  >
                    <option value="ELEMENTARY">SD</option>
                    <option value="JUNIOR_HIGH">SMP</option>
                    <option value="SENIOR_HIGH">SMA</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                    Locale
                  </label>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as 'id' | 'en')}
                    className="mt-1 w-full rounded-md border border-[#e2ddd0] bg-white px-3 py-2 text-[11px] text-[#4a4035]"
                  >
                    <option value="id">Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 flex items-center justify-between border-t border-[#e2ddd0] pt-4">
                <span className="text-[10px] italic text-[#b9b2a3]">
                  {age} thn · {gender} · {edu}
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#4a4035] px-4 py-2 text-[11px] font-semibold text-[#f4f1ea] shadow-sm transition hover:bg-[#3a3228] disabled:opacity-30"
                >
                  Buat Sesi →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Session ID */}
      <div className="space-y-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#b9b2a3]">
          Session ID
        </span>
        <form onSubmit={handlePasteReconnect}>
          <input
            type="text"
            value={pasteId}
            onChange={(e) => setPasteId(e.target.value)}
            placeholder="paste id... ↵"
            className="w-full rounded-md border border-[#e2ddd0] bg-white px-2.5 py-1.5 text-[10px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none"
          />
        </form>
      </div>

      {/* Session list — only sessions with chat history */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {state.sessionId && (
          <div className="flex items-center gap-2 rounded-lg bg-[#4a4035] px-3 py-2.5 text-[10px] font-semibold text-[#f4f1ea] shadow-md">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />
            <span className="truncate">{state.sessionId}</span>
            <span className="shrink-0 text-[8px] text-emerald-300">active</span>
          </div>
        )}

        {state.sessions.filter((s) => s.id !== state.sessionId && s.messageCount > 0).length >
          0 && (
          <span className="block pt-2 text-[9px] font-semibold uppercase tracking-wider text-[#b9b2a3]">
            Recent
          </span>
        )}

        {state.sessions
          .filter((s) => s.id !== state.sessionId && s.messageCount > 0)
          .slice(0, 5)
          .map((session) => (
            <SessionListRow key={session.id} session={session} onSelect={reconnectSession} />
          ))}

        {/* More sessions button */}
        {state.sessions.filter((s) => s.id !== state.sessionId && s.messageCount > 0).length >
          5 && (
          <MoreSessionsButton
            sessions={state.sessions.filter((s) => s.id !== state.sessionId && s.messageCount > 0)}
            onSelect={reconnectSession}
          />
        )}

        {state.sessions.filter((s) => s.id !== state.sessionId && s.messageCount > 0).length ===
          0 &&
          !state.sessionId && (
            <p className="py-4 text-center text-[9px] text-[#cfc9bd]">No recent sessions</p>
          )}
      </div>

      {/* End Session */}
      {state.sessionId && (
        <button
          onClick={reset}
          className="mt-auto flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-medium text-red-600 transition hover:bg-red-100"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4a4035] text-[8px] text-white">
            N
          </span>
          End Session
        </button>
      )}
    </aside>
  );
}

/** Single session row in the sidebar list */
function SessionListRow({
  session,
  onSelect,
}: {
  session: SessionListItem;
  onSelect: (id: string) => void;
}) {
  const date = new Date(session.createdAt);
  const timeAgo = formatTimeAgo(date);
  const isCompleted = session.status === 'COMPLETED';

  return (
    <button
      onClick={() => onSelect(session.id)}
      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-white hover:shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCompleted ? 'bg-emerald-400' : 'bg-[#d9a319]'}`}
        />
        <span className="truncate text-[10px] font-medium text-[#4a4035]">{session.id}</span>
        {session.totalScore !== null && (
          <span className="ml-auto shrink-0 text-[9px] font-bold text-[#8a8070]">
            {session.totalScore}pt
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-3.5 text-[9px] text-[#b9b2a3]">
        <span>{session.messageCount} msg</span>
        <span>·</span>
        <span>{timeAgo}</span>
      </div>
    </button>
  );
}

/** "More sessions" button + table popup matching wireframe */
function MoreSessionsButton({
  sessions,
  onSelect,
}: {
  sessions: SessionListItem[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = sessions.filter((s) => {
    const matchesSearch = !search || s.id.toLowerCase().includes(search.toLowerCase());
    const matchesRisk = riskFilter === 'all' || s.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const handleOpen = () => {
    setSelectedId(null);
    setSearch('');
    setRiskFilter('all');
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[#e2ddd0] px-3 py-2 text-[9px] font-medium text-[#8a8070] transition hover:border-[#cfc9bd] hover:bg-white"
      >
        more sessions ({sessions.length - 5})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-2xl flex-col rounded-2xl border border-[#cfc9bd] bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-[14px] font-bold text-[#4a4035]">
                Semua Sesi
                <span className="ml-2 text-[11px] font-normal text-[#b9b2a3]">
                  · {sessions.length} total
                </span>
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#b9b2a3] transition hover:bg-[#f7f4ee] hover:text-[#4a4035]"
              >
                ✕
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 px-5 pb-3">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#b9b2a3]">
                  🔍
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="cari session id / persona..."
                  className="w-full rounded-md border border-[#e2ddd0] bg-white py-2 pl-7 pr-3 text-[11px] text-[#4a4035] placeholder:text-[#cfc9bd] focus:border-[#d9a319] focus:outline-none"
                />
              </div>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="rounded-lg border border-[#e2ddd0] bg-white px-2.5 py-2 text-[10px] font-medium text-[#6b5e4f]"
              >
                <option value="all">risk: all</option>
                <option value="HIGH">risk: HIGH</option>
                <option value="MODERATE">risk: MOD</option>
                <option value="LOW">risk: LOW</option>
              </select>
            </div>

            {/* Table */}
            <div className="max-h-80 overflow-y-auto px-5">
              {/* Header row */}
              <div className="sticky top-0 grid grid-cols-[1fr_110px_50px_60px_55px] gap-2 border-b border-[#e2ddd0] bg-white pb-2 text-[9px] font-bold uppercase tracking-wider text-[#b9b2a3]">
                <span>Session</span>
                <span>Persona</span>
                <span className="text-center">Turns</span>
                <span className="text-center">Risk</span>
                <span className="text-right">Updated</span>
              </div>

              {/* Data rows */}
              {filtered.map((session) => {
                const date = new Date(session.createdAt);
                const timeAgo = formatTimeAgo(date);
                const isActive = session.status !== 'COMPLETED';
                const isSelected = selectedId === session.id;
                const turns = Math.floor(session.messageCount / 2);

                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedId(session.id)}
                    className={`grid w-full grid-cols-[1fr_110px_50px_60px_55px] items-center gap-2 border-b border-[#f4f1ea] py-2.5 text-left transition ${
                      isSelected ? 'bg-[#fef9e7]' : 'hover:bg-[#f7f4ee]'
                    }`}
                  >
                    {/* Session */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-[#d9a319]' : 'bg-[#cfc9bd]'}`}
                      />
                      <span className="truncate text-[11px] text-[#6b8ab8]">{session.id}</span>
                      {isActive && (
                        <span className="text-[8px] font-medium text-[#d9a319]">active</span>
                      )}
                    </div>

                    {/* Persona */}
                    <span className="text-[11px] font-medium text-[#4a4035]">
                      {getPersonaLabel(session)}
                    </span>

                    {/* Turns */}
                    <span className="text-center text-[11px] text-[#4a4035]">{turns}</span>

                    {/* Risk */}
                    <div className="flex justify-center">
                      {session.riskLevel ? (
                        <RiskBadge level={session.riskLevel} />
                      ) : (
                        <span className="text-[10px] text-[#cfc9bd]">—</span>
                      )}
                    </div>

                    {/* Updated */}
                    <span className="text-right text-[10px] text-[#b9b2a3]">{timeAgo}</span>
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="py-6 text-center text-[11px] text-[#b9b2a3]">
                  Tidak ada sesi yang cocok
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#e2ddd0] px-5 py-3">
              <span className="text-[10px] italic text-[#b9b2a3]">
                {filtered.length} / {sessions.length} · semua termuat
              </span>
              <button
                onClick={() => {
                  if (selectedId) {
                    onSelect(selectedId);
                    setOpen(false);
                  }
                }}
                disabled={!selectedId}
                className="rounded-lg bg-[#4a4035] px-4 py-2 text-[11px] font-semibold text-[#f4f1ea] shadow-sm transition hover:bg-[#3a3228] disabled:opacity-30"
              >
                Buka sesi →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    HIGH: 'bg-red-50 text-red-500',
    MODERATE: 'bg-amber-50 text-amber-600',
    LOW: 'bg-emerald-50 text-emerald-600',
  };
  const labels: Record<string, string> = { HIGH: 'HIGH', MODERATE: 'MOD', LOW: 'LOW' };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${styles[level] || 'bg-gray-50 text-gray-500'}`}
    >
      {labels[level] || level}
    </span>
  );
}

function getPersonaLabel(session: SessionListItem): string {
  // Infer from score heuristic (in real app, this would come from demographics)
  if (session.totalScore === null) return '—';
  if (session.totalScore > 10) return 'Dewasa';
  if (session.totalScore > 5) return 'Santri Remaja';
  return 'Santri Muda';
}

/** Format date as relative time (e.g., "2m ago", "1h ago", "3d ago") */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
