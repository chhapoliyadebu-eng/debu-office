import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * Triggers a real, on-demand fetch+parse of one circular source (CS
 * Haryana or Finance Department Haryana) — the exact same logic as the
 * 15-minute scheduled job, just run immediately for this one source. Never
 * fabricates data: if the source page has nothing new, `written` is 0.
 */
export async function scrapeCircularsNow(sourceKey: string): Promise<{ candidatesFound: number; written: number }> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/circulars/scrape-now`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ sourceKey }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Scrape failed (${response.status})`);
  }
  return response.json();
}
