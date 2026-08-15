import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function post(path: string): Promise<any> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${response.status})`);
  }
  return response.json();
}

/**
 * These all go through the backend (not a direct client Firestore write)
 * so each one gets a real actor-attributed entry in the Firestore
 * `auditLog` collection — see the matching routes in functions/index.js
 * and the comments in firestore.rules explaining why client writes to
 * these fields are now blocked (`allow update: if false`).
 */
export const verifyRule = (id: string) => post(`/api/rules/${id}/verify`);
export const rejectRule = (id: string) => post(`/api/rules/${id}/reject`);
export const verifyPayment = (id: string) => post(`/api/payments/${id}/verify`);
export const rejectPayment = (id: string) => post(`/api/payments/${id}/reject`);
export const publishCircular = (id: string) => post(`/api/circulars/${id}/publish`);
export const dismissCircular = (id: string) => post(`/api/circulars/${id}/dismiss`);
