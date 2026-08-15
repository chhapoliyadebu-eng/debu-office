import React, { useRef, useState } from "react";
import { AttachmentRecord, DemoUser } from "../data/mockData";
import { uploadAttachment, getAttachmentDownloadUrl, deleteAttachment } from "../lib/attachmentsApi";
import { formatSize } from "../lib/formatSize";

/**
 * Attaches a scan/PDF/photo to a document or incoming letter. The Storage
 * upload itself (lib/firebase.ts uploadPrivateFile) and the Firestore
 * `attachments` pointer record were already fully built and secured
 * (storage.rules, firestore.rules) but had no UI anywhere calling them —
 * this is that missing UI.
 */
export function AttachmentsPanel({
  user,
  authUid,
  linkedType,
  linkedId,
  attachments,
}: {
  user: DemoUser;
  authUid: string;
  linkedType: "document" | "incomingLetter";
  linkedId: string | null; // null until the parent record has been saved at least once
  attachments: AttachmentRecord[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const relevant = attachments.filter((a) => a.linkedType === linkedType && a.linkedId === linkedId);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !linkedId) return;
    setUploading(true);
    setError(null);
    try {
      await uploadAttachment(file, authUid, user.name, user.department || "Unassigned", user.wing, linkedType, linkedId);
      // No local state push needed — the attachments collection has a
      // real-time Firestore listener in App.tsx; the new doc will appear
      // in `attachments` automatically once the write lands.
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    }
    setUploading(false);
  }

  async function handleDownload(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const url = await getAttachmentDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setError(err.message || "Could not download this file.");
    }
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteAttachment(id);
    } catch (err: any) {
      setError(err.message || "Could not delete this file.");
    }
    setBusyId(null);
  }

  return (
    <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
      <h4 className="font-display text-sm text-navy mb-2">Attachments</h4>
      {!linkedId && <p className="text-xs text-ink/40 mb-2">Save this first — attachments can be added once it exists.</p>}
      {error && <p className="text-xs text-brick mb-2">{error}</p>}

      {relevant.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {relevant.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs bg-white/50 rounded-sm px-2.5 py-1.5">
              <div className="truncate mr-2">
                <span className="font-medium">{a.fileName}</span>{" "}
                <span className="text-ink/40">
                  ({formatSize(a.size)} · {a.uploaderName})
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleDownload(a.id)} disabled={busyId === a.id} className="text-navy hover:underline disabled:opacity-50">
                  {busyId === a.id ? "…" : "Download"}
                </button>
                {(a.uploadedBy === authUid || user.role === "ADMIN" || (user.role === "DEPARTMENT_ADMIN" && a.department === user.department)) && (
                  <button onClick={() => handleDelete(a.id)} disabled={busyId === a.id} className="text-brick hover:underline disabled:opacity-50">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt" />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={!linkedId || uploading}
        className="text-xs font-semibold text-navy hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploading ? "Uploading…" : "+ Attach a file (PDF, Word, Excel, image — max 25 MB)"}
      </button>
    </div>
  );
}
