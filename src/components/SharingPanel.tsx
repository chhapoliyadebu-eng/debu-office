import React, { useEffect, useState } from "react";
import { DemoUser, SharePermission } from "../data/mockData";
import { fetchDirectory, shareDocument, unshareDocument, DirectoryEntry } from "../lib/directoryApi";

/**
 * Real colleague directory (GET /api/directory) replaces what used to be a
 * hardcoded demo-user list — in production that list showed fake names
 * that didn't correspond to any real account, so "sharing" with one of
 * them was silently a no-op. Every share/revoke here goes through the
 * backend (see lib/directoryApi.ts) so access is actually granted at the
 * firestore.rules level, not just cosmetically recorded.
 */
export function SharingPanel({
  currentUser,
  docId,
  sharedWith,
  onSharedChanged,
}: {
  currentUser: DemoUser;
  docId: string | null;
  sharedWith: Record<string, { permission: SharePermission; sharedAt: string; sharedBy: string }>;
  onSharedChanged: () => void; // parent re-fetches/re-derives the document after a successful share/unshare
}) {
  const [colleagues, setColleagues] = useState<DirectoryEntry[]>([]);
  const [target, setTarget] = useState("");
  const [permission, setPermission] = useState<SharePermission>("VIEW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDirectory().then(setColleagues).catch(() => setColleagues([]));
  }, []);

  async function share() {
    if (!docId) {
      setError("Pehle document ko Save karein, uske baad share ho sakega.");
      return;
    }
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await shareDocument(docId, target, permission);
      setTarget("");
      onSharedChanged();
    } catch (err: any) {
      setError(err.message || "Share failed.");
    }
    setBusy(false);
  }

  async function revoke(uid: string) {
    if (!docId) return;
    setBusy(true);
    setError(null);
    try {
      await unshareDocument(docId, uid);
      onSharedChanged();
    } catch (err: any) {
      setError(err.message || "Revoke failed.");
    }
    setBusy(false);
  }

  const nameFor = (uid: string) => colleagues.find((c) => c.uid === uid)?.name || uid;

  return (
    <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
      <h4 className="font-display text-sm text-navy mb-2">Share this document</h4>
      {error && <p className="text-xs text-brick mb-2">{error}</p>}

      {Object.keys(sharedWith || {}).length > 0 && (
        <div className="space-y-1.5 mb-3">
          {Object.entries(sharedWith).map(([uid, s]) => (
            <div key={uid} className="flex items-center justify-between text-xs bg-white/50 rounded-sm px-2.5 py-1.5">
              <span>{nameFor(uid)} — <span className="text-ink/50">{s.permission}</span></span>
              <button onClick={() => revoke(uid)} disabled={busy} className="text-brick hover:underline disabled:opacity-50">
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {colleagues.length === 0 ? (
        <p className="text-xs text-ink/40">No colleagues found in your department yet to share with.</p>
      ) : (
        <div className="flex gap-2">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1 text-xs border border-[#d8cfb6] rounded-sm px-2 py-1.5">
            <option value="">Select a colleague…</option>
            {colleagues
              .filter((c) => !(sharedWith && sharedWith[c.uid]))
              .map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.name} ({c.seat})
                </option>
              ))}
          </select>
          <select value={permission} onChange={(e) => setPermission(e.target.value as SharePermission)} className="text-xs border border-[#d8cfb6] rounded-sm px-2 py-1.5">
            <option value="VIEW">View</option>
            <option value="COMMENT">Comment</option>
            <option value="EDIT">Edit</option>
          </select>
          <button onClick={share} disabled={busy || !target} className="text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-sm hover:bg-navy-deep disabled:opacity-50">
            {busy ? "…" : "Share"}
          </button>
        </div>
      )}
    </div>
  );
}
