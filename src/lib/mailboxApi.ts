/**
 * Calls the Firebase Cloud Function backend (see functions/index.js).
 * Frontend (Netlify) and backend (Firebase Functions) are on different
 * domains in this deployment shape, so VITE_API_BASE_URL must be set to
 * the deployed function's full URL — see .env.example.
 */
import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export interface ConnectMailboxParams {
  branchOrSeat: string;
  officeEmail: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  connectedBy: string;
}

/**
 * Sends office mailbox credentials to the backend ONCE, over HTTPS, to be
 * encrypted and stored server-side. The browser never sees them again after
 * this call — see functions/index.js's /mailbox/connect route.
 */
export async function connectMailbox(params: ConnectMailboxParams): Promise<{ accountId: string }> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/connect`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Connect failed (${response.status})`);
  }
  return response.json();
}

export interface FetchedMailItem {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  attachments: string[];
}

export async function fetchInbox(accountId: string): Promise<FetchedMailItem[]> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/${accountId}/inbox`, {
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Inbox fetch failed (${response.status})`);
  }
  const data = await response.json();
  return data.messages || [];
}

export async function sendOfficeMail(accountId: string, to: string, subject: string, body: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/${accountId}/send`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ to, subject, body }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Send failed (${response.status})`);
  }
}

/**
 * Disconnects an office mailbox — deletes its encrypted credentials from
 * the backend entirely (not just marking it inactive), so this office/
 * branch can connect a replacement mailbox later. DEPARTMENT_ADMIN/ADMIN
 * only. Every officer who had joined it is automatically freed to join a
 * different mailbox.
 */
export async function disconnectMailbox(accountId: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/${accountId}/disconnect`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Disconnect failed (${response.status})`);
  }
}

/**
 * Joins an already-connected office mailbox so this officer can see its
 * inbox and send mail from it. Any number of officers may join the same
 * office mailbox. An officer may be joined to only ONE office mailbox at a
 * time — the backend rejects this with 409 if already joined elsewhere.
 */
export async function joinMailbox(accountId: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/${accountId}/join`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Join failed (${response.status})`);
  }
}

/** Leaves an office mailbox this officer had previously joined. */
export async function leaveMailbox(accountId: string): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/mailbox/${accountId}/leave`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Leave failed (${response.status})`);
  }
}
