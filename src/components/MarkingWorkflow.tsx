import React, { useEffect, useState } from "react";
import { classNames, SealBadge, StatusPill } from "./common";
import { DemoUser, IncomingLetter, Marking } from "../data/mockData";
import { fetchDirectory, DirectoryEntry } from "../lib/directoryApi";

export function MarkingWorkflow({
  user,
  incoming,
  markings,
  onCreateMarking,
  preselectedLetter,
  onDraftResponse,
}: {
  user: DemoUser;
  incoming: IncomingLetter[];
  markings: Marking[];
  onCreateMarking: (args: { incomingLetterId: string; markedTo: string; instructions: string }) => void;
  preselectedLetter: string | null;
  onDraftResponse: (letterId: string) => void;
}) {
  const [selectedLetterId, setSelectedLetterId] = useState<string>(preselectedLetter || incoming[0]?.id);
  const [markedTo, setMarkedTo] = useState("");
  const [instructions, setInstructions] = useState("");
  // Real registered colleagues in the caller's own department — this used
  // to be a hardcoded demo-user list, which meant a letter could never
  // actually be routed to a real officer's real seat in production (the
  // single most important workflow in the whole portal was silently
  // fake). See lib/directoryApi.ts / GET /api/directory.
  const [colleagues, setColleagues] = useState<DirectoryEntry[]>([]);

  useEffect(() => {
    fetchDirectory().then((list) => {
      setColleagues(list);
      if (list.length > 0) setMarkedTo((prev) => prev || list[0].seat);
    }).catch(() => setColleagues([]));
  }, []);

  useEffect(() => {
    if (preselectedLetter) setSelectedLetterId(preselectedLetter);
  }, [preselectedLetter]);

  const letter = incoming.find((l) => l.id === selectedLetterId);
  const chain = markings.filter((m) => m.incomingLetterId === selectedLetterId).sort((a, b) => a.markedAt.localeCompare(b.markedAt));

  return (
    <div className="rise-in">
      <h1 className="font-display text-2xl text-navy mb-1">Marking / Dak-Routing</h1>
      <p className="text-sm text-ink/55 mb-6">
        Digital equivalent of physically marking a file to the next desk — original letter content stays immutable; only routing
        instructions are appended.
      </p>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-2">
          <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Received Letter</label>
          {incoming.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedLetterId(l.id)}
              className={classNames(
                "w-full text-left p-3 rounded-sm border text-sm transition-colors",
                selectedLetterId === l.id ? "border-brick bg-[#fdfcf8]" : "border-[#d8cfb6] bg-white/40 hover:bg-[#fdfcf8]"
              )}
            >
              <div className="font-mono text-[11px] text-brick">{l.id}</div>
              <div className="mt-0.5">{l.subject}</div>
            </button>
          ))}
        </div>

        <div className="col-span-2 space-y-6">
          {letter && (
            <>
              <div className="noting-sheet rounded-sm">
                <div className="noting-body !py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <SealBadge tone="navy">🔒 Original content — immutable</SealBadge>
                  </div>
                  <h3 className="font-display text-base text-navy">{letter.subject}</h3>
                  <p className="text-sm text-ink/80 mt-2 leading-relaxed">{letter.content}</p>
                </div>
              </div>

              <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-5">
                <h4 className="font-display text-sm text-navy mb-3">Routing Chain</h4>
                {chain.length === 0 && <p className="text-xs text-ink/45">No markings yet on this letter.</p>}
                <div className="space-y-3">
                  {chain.map((m, i) => (
                    <div key={m.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={classNames(
                            "w-2.5 h-2.5 rounded-full mt-1.5",
                            m.status === "ACTIONED" ? "bg-seal" : m.status === "RETURNED" ? "bg-gold" : "bg-brick"
                          )}
                        />
                        {i < chain.length - 1 && <div className="w-px flex-1 bg-[#d8cfb6]" />}
                      </div>
                      <div className="pb-3 flex-1">
                        <div className="text-sm">
                          <span className="font-semibold">{m.markedBy}</span> → <span className="font-semibold">{m.markedTo}</span>
                        </div>
                        <div className="text-xs text-ink/60 mt-0.5">{m.instructions}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-mono text-ink/40">{m.markedAt}</span>
                          <StatusPill status={m.status} />
                        </div>
                        {m.status !== "ACTIONED" && m.markedTo === user.seat && (
                          <button onClick={() => onDraftResponse(letter.id)} className="text-xs font-semibold text-brick hover:underline mt-1.5">
                            Draft response in editor →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-navy rounded-sm p-5">
                <h4 className="font-display text-sm text-[#e7ddc4] mb-3">Mark this letter</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#e7ddc4]/70">Mark to (officer/seat)</label>
                    <select
                      value={markedTo}
                      onChange={(e) => setMarkedTo(e.target.value)}
                      disabled={colleagues.length === 0}
                      className="w-full mt-1 text-sm rounded-sm px-3 py-2 bg-white/95 focus:outline-none disabled:opacity-60"
                    >
                      {colleagues.length === 0 && <option value="">No colleagues found in your department</option>}
                      {colleagues.map((c) => (
                        <option key={c.uid} value={c.seat}>
                          {c.name} — {c.seat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-[#e7ddc4]/70">Status on mark</label>
                    <input disabled value="PENDING" className="w-full mt-1 text-sm rounded-sm px-3 py-2 bg-white/60 text-ink/60" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-[11px] text-[#e7ddc4]/70">Instructions</label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={2}
                    placeholder="e.g. Please examine and put up draft reply by..."
                    className="w-full mt-1 text-sm rounded-sm px-3 py-2 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!instructions.trim() || !markedTo) return;
                    onCreateMarking({ incomingLetterId: letter.id, markedTo, instructions });
                    setInstructions("");
                  }}
                  disabled={!markedTo}
                  className="mt-3 bg-brick hover:bg-brick-deep text-white text-sm font-semibold px-4 py-2 rounded-sm disabled:opacity-50"
                >
                  Mark &amp; Route →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
