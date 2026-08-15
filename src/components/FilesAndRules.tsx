import React, { useState } from "react";
import { classNames } from "./common";
import { FileRecord, DemoUser } from "../data/mockData";
import { moveFile } from "../lib/directoryApi";

export function FilesRegister({ files, user, canMoveAny }: { files: FileRecord[]; user: DemoUser; canMoveAny: boolean }) {
  const [q, setQ] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toSeat, setToSeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = files.filter((f) => (f.subject + f.fileNo + f.branch).toLowerCase().includes(q.toLowerCase()));

  async function submitMove(fileId: string) {
    if (!toSeat.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await moveFile(fileId, toSeat.trim());
      setMovingId(null);
      setToSeat("");
      // No local state update needed — the files collection has a live
      // Firestore listener in App.tsx; it'll reflect the new currentSeat
      // once the backend's batch write lands.
    } catch (err: any) {
      setError(err.message || "Move failed.");
    }
    setBusy(false);
  }

  return (
    <div className="rise-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-navy">Files Register</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search file no., subject, branch…"
          className="text-sm border border-[#d8cfb6] rounded-md px-3 py-1.5 bg-white w-72 focus:outline-none focus:ring-2 focus:ring-brick/30"
        />
      </div>
      {error && <p className="text-xs text-brick mb-2">{error}</p>}
      <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f4efe1] text-ink/60 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">File No.</th>
              <th className="text-left px-4 py-3 font-semibold">Subject</th>
              <th className="text-left px-4 py-3 font-semibold">Branch</th>
              <th className="text-left px-4 py-3 font-semibold">Current Seat</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Updated</th>
              <th className="text-left px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => {
              const canMove = canMoveAny || f.ownerUid === user.id;
              return (
                <tr key={f.id} className="border-t border-[#e6dcc2] hover:bg-[#f4efe1]/60">
                  <td className="px-4 py-3 font-mono text-xs text-brick">{f.fileNo}</td>
                  <td className="px-4 py-3">{f.subject}</td>
                  <td className="px-4 py-3 text-ink/70">{f.branch}</td>
                  <td className="px-4 py-3 text-ink/70 font-mono text-xs">{f.currentSeat || f.branch}</td>
                  <td className="px-4 py-3">
                    <span
                      className={classNames(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        f.status === "Open" ? "bg-seal/10 text-seal" : "bg-ink/10 text-ink/50"
                      )}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/50">{f.updated}</td>
                  <td className="px-4 py-3">
                    {canMove &&
                      (movingId === f.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={toSeat}
                            onChange={(e) => setToSeat(e.target.value)}
                            placeholder="New seat"
                            autoFocus
                            className="text-xs border border-[#d8cfb6] rounded-sm px-2 py-1 w-32"
                          />
                          <button onClick={() => submitMove(f.id)} disabled={busy || !toSeat.trim()} className="text-xs font-semibold text-navy hover:underline disabled:opacity-50">
                            {busy ? "…" : "Go"}
                          </button>
                          <button onClick={() => { setMovingId(null); setToSeat(""); }} className="text-xs text-ink/40 hover:underline">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setMovingId(f.id)} className="text-xs font-semibold text-navy hover:underline">
                          Move
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink/40 mt-3">File numbers follow BRANCHCODE/YEAR/SERIAL. Every move is recorded as a permanent, un-editable movement event.</p>
    </div>
  );
}
