import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * Updates another user's designation/wing/department/seat/role.
 * Goes through the backend (not a direct client Firestore write) so the
 * edit gets a proper actor-attributed audit-log entry, and so
 * DEPARTMENT_ADMIN can manage their own department's officers without
 * needing broad Firestore-level write access to the `users` collection.
 * See PATCH /api/users/:uid in functions/index.js for the authorization
 * rules (ADMIN: full power; DEPARTMENT_ADMIN: USER-role accounts in their
 * own department, or unclaimed "Unassigned" sign-ups, role/department
 * moves excluded).
 */
export async function updateUser(
  uid: string,
  patch: { designation?: string; wing?: string; department?: string; seat?: string; role?: "USER" | "DEPARTMENT_ADMIN" | "ADMIN" }
): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/users/${uid}`, {
    method: "PATCH",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Update failed (${response.status})`);
  }
}
