import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export interface DirectoryEntry {
  uid: string;
  name: string;
  seat: string;
  designation: string;
}

/** Real registered colleagues in the caller's own department — replaces the old hardcoded demo-user list in the Share picker. */
export async function fetchDirectory(): Promise<DirectoryEntry[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/directory`, {
    method: "GET",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.colleagues || [];
}

/**
 * Shares/unshares a document. This is the ONLY way `documents/{id}.sharedWith`
 * ever changes — firestore.rules blocks direct client writes to it — so
 * every share/revoke gets a real audit-log entry, and only the document's
 * actual owner (or ADMIN) can grant access, verified server-side.
 */
export async function shareDocument(docId: string, targetUid: string, permission: "VIEW" | "COMMENT" | "EDIT"): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/documents/${docId}/share`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ targetUid, permission }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Share failed (${response.status})`);
  }
}

export async function unshareDocument(docId: string, targetUid: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/documents/${docId}/unshare`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ targetUid }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Revoke failed (${response.status})`);
  }
}

/**
 * Moves a file to a different seat and records an immutable movement
 * event server-side (POST /api/files/:fileId/move). This existed in the
 * backend already but had no caller anywhere in the UI — Files Register
 * was a read-only table with no way to actually move a file, despite the
 * movement-history feature being fully built and audited on the backend.
 */
export async function moveFile(fileId: string, toSeat: string, remarks?: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/files/${fileId}/move`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ toSeat, remarks: remarks || "" }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Move failed (${response.status})`);
  }
}
