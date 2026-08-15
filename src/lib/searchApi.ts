import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * Records an RTI-flagged search to the real Firestore auditLog — this is
 * what actually backs the "logged separately for RTI audit purposes"
 * claim in Global Search. Without calling this, the checkbox was purely
 * cosmetic and nothing was ever recorded anywhere.
 */
export async function logRtiSearch(
  query: string,
  resultCounts: { files: number; letters: number; documents: number; rules: number; templates: number }
): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/search/log-rti`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ query, resultCounts }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Could not log this search (${response.status})`);
  }
}
