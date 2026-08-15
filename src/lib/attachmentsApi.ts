import { getAuthenticatedApiHeaders, uploadPrivateFile, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { AttachmentRecord } from "../data/mockData";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // matches storage.rules' files/{uid}/... limit

/**
 * Uploads a file into the caller's own private Storage path
 * (files/{uid}/...) and records a matching `attachments` Firestore doc
 * linking it to a document or incoming letter. Both storage.rules and
 * firestore.rules independently enforce that a user can only ever create
 * an attachment record pointing at a Storage path under their own uid —
 * this function just does both steps in the right order.
 */
export async function uploadAttachment(
  file: File,
  uid: string,
  uploaderName: string,
  department: string,
  wing: string,
  linkedType: "document" | "incomingLetter",
  linkedId: string
): Promise<AttachmentRecord> {
  if (!db) throw new Error("Firestore not configured");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("File is too large — 25 MB maximum.");
  }

  const { path } = await uploadPrivateFile(uid, file, "files");
  const storageFileName = path.split("/").pop() || file.name;

  const id = "ATT-" + Date.now().toString(36).toUpperCase();
  const record: AttachmentRecord = {
    id,
    fileName: file.name,
    storagePath: path,
    storageFileName,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedBy: uid,
    uploaderName,
    department,
    wing,
    linkedType,
    linkedId,
    uploadedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "attachments", id), record);
  return record;
}

/** Gets a short-lived (5 minute) signed download URL, after a server-side authorization check — see GET /api/attachments/:id/download-url. */
export async function getAttachmentDownloadUrl(attachmentId: string): Promise<string> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/attachments/${attachmentId}/download-url`, {
    method: "GET",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Could not get a download link (${response.status})`);
  }
  const data = await response.json();
  return data.url;
}

/** Deletes both the Storage object and the Firestore pointer — see DELETE /api/attachments/:id. */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Delete failed (${response.status})`);
  }
}
