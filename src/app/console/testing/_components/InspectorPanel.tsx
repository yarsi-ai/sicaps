'use client';

import { detectCrisis } from './detect-crisis';
import { parseInstruction } from './parse-instruction';
import { useTestingContext } from './TestingContext';

export function InspectorPanel() {
  const { state, toggleInspector } = useTestingContext();
  const selectedTurn = state.turns.find((t) => t.turnNumber === state.selectedTurn) ?? null;

  if (!state.inspectorOpen) return null;

  return (
    <aside className="h-full overflow-y-auto border-l border-[#cfc9bd] bg-white">
      <div className="p-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[12px] font-bold text-[#4a4035]">Inspector</h3>
          <button
            onClick={toggleInspector}
            className="text-[10px] text-[#b9b2a3] transition hover:text-[#6b5e4f]"
          >
            hide
          </button>
        </div>

        {!selectedTurn ? (
          <p className="text-[11px] text-[#b9b2a3]">Select a turn to inspect</p>
        ) : (
          <div className="space-y-4">
            {/* Instruction Viewer */}
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                Instruction · Turn {selectedTurn.turnNumber}
              </p>
              {(() => {
                const parsed = parseInstruction(selectedTurn.log.systemMessage);
                const hasCrisis = detectCrisis(selectedTurn.log.systemMessage);
                return (
                  <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[11px]">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#8a8070]">Type</span>
                        <span className="font-semibold text-[#4a4035]">{parsed?.type ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8a8070]">Target</span>
                        <span className="font-semibold text-[#4a4035]">
                          {parsed?.target ?? '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8a8070]">Follow-up</span>
                        <span className="font-semibold text-[#4a4035]">
                          {parsed ? (parsed.isFollowUp ? 'Yes' : 'No') : '—'}
                        </span>
                      </div>
                    </div>
                    {hasCrisis && (
                      <span className="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">
                        CRISIS
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Extraction & Scoring Impact */}
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                Extraction · Turn {selectedTurn.turnNumber}
              </p>
              {(() => {
                try {
                  const raw = JSON.parse(selectedTurn.log.rawResponse);
                  const dimensi = raw?.extraction?.dimensi;
                  if (!dimensi || Object.keys(dimensi).length === 0) {
                    return (
                      <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[10px] text-[#b9b2a3]">
                        Tidak ada dimensi terdeteksi turn ini
                      </div>
                    );
                  }
                  const filledDims = Object.entries(dimensi).filter(([, v]) => {
                    const val = v as { keywords?: string[]; negasi?: string[] } | undefined;
                    return (
                      val && ((val.keywords?.length ?? 0) > 0 || (val.negasi?.length ?? 0) > 0)
                    );
                  });
                  if (filledDims.length === 0) {
                    return (
                      <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[10px] text-[#b9b2a3]">
                        Tidak ada dimensi terdeteksi turn ini
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[10px]">
                      {filledDims.map(([dim, v]) => {
                        const val = v as { keywords?: string[]; negasi?: string[] };
                        const isChipsExclusive = [
                          'kontak',
                          'lokasi_tubuh',
                          'faktor_risiko',
                        ].includes(dim);
                        return (
                          <div key={dim} className="mb-1.5">
                            <span className="font-semibold text-[#4a4035]">{dim}</span>
                            {isChipsExclusive && (
                              <span className="ml-1 text-[8px] text-orange-500">(signal)</span>
                            )}
                            <div className="ml-2 flex flex-wrap gap-1 mt-0.5">
                              {(val.keywords ?? []).map((kw, i) => (
                                <span
                                  key={`k-${i}`}
                                  className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700"
                                >
                                  {kw}
                                </span>
                              ))}
                              {(val.negasi ?? []).map((neg, i) => (
                                <span
                                  key={`n-${i}`}
                                  className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] text-red-600"
                                >
                                  ✗ {neg}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                } catch {
                  return (
                    <div className="rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[10px] text-[#b9b2a3]">
                      Extraction gagal / tidak ada
                    </div>
                  );
                }
              })()}
            </div>

            {/* Scoring State (at this turn) */}
            {(() => {
              try {
                const raw = JSON.parse(selectedTurn.log.rawResponse);
                const gatalMalam = raw?.extraction?.gatalMalam;
                if (gatalMalam === null || gatalMalam === undefined) return null;
                return (
                  <div>
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                      Gatal Malam Detection
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${gatalMalam ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'}`}
                    >
                      {gatalMalam ? '● Ya (malam)' : '○ Tidak'}
                    </span>
                  </div>
                );
              } catch {
                return null;
              }
            })()}

            {/* Raw LLM Response */}
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                Raw LLM Response (JSON)
              </p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-[#2d2a26] p-3 text-[9px] leading-relaxed text-emerald-300 shadow-inner">
                {formatJson(selectedTurn.log.rawResponse)}
              </pre>
            </div>

            {/* System Message — Extraction */}
            <div>
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                Extraction Prompt{' '}
                <span className="font-normal text-[#cfc9bd]">
                  (prompt {selectedTurn.log.promptVersion})
                </span>
              </p>
              <pre className="max-h-48 overflow-auto rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-3 text-[9px] leading-relaxed text-[#4a4035]">
                {selectedTurn.log.systemMessage}
              </pre>
            </div>

            {/* Compose Prompt */}
            {(() => {
              try {
                const raw = JSON.parse(selectedTurn.log.rawResponse);
                const compose = raw?.compose;
                if (!compose?.systemPrompt) return null;
                return (
                  <div>
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#b9b2a3]">
                      Compose Prompt{' '}
                      <span className="font-normal text-[#cfc9bd]">(phase: {compose.phase})</span>
                    </p>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-blue-100 bg-blue-50 p-3 text-[9px] leading-relaxed text-[#4a4035]">
                      {compose.systemPrompt}
                    </pre>
                    {compose.chatHistory && compose.chatHistory.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-[9px] font-bold text-[#b9b2a3]">
                          Chat History Sent:
                        </p>
                        <div className="max-h-32 overflow-auto rounded-lg border border-[#e2ddd0] bg-[#f7f4ee] p-2 text-[9px] space-y-1">
                          {compose.chatHistory.map(
                            (msg: { role: string; content: string }, i: number) => (
                              <div
                                key={i}
                                className={`${msg.role === 'user' ? 'text-blue-600' : 'text-[#6b5e4f]'}`}
                              >
                                <span className="font-bold">{msg.role}:</span> {msg.content}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                    {compose.botReply && (
                      <div className="mt-2">
                        <p className="mb-1 text-[9px] font-bold text-[#b9b2a3]">Bot Reply:</p>
                        <div className="rounded-lg border border-[#e2ddd0] bg-white p-2 text-[10px] text-[#4a4035]">
                          {compose.botReply}
                        </div>
                      </div>
                    )}
                  </div>
                );
              } catch {
                return null;
              }
            })()}

            {/* Metadata footer */}
            <div className="rounded-lg border border-dashed border-[#e2ddd0] bg-[#f7f4ee] p-2.5 text-[9px] text-[#8a8070]">
              panel terpisah · bisa di-toggle dari app bar
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
