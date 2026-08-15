/**
 * IMPORTANT — Section 31/32 (API Security):
 * The Claude API key must NEVER be called directly from the frontend/browser.
 *
 * This calls your Firebase Cloud Function backend (functions/index.js →
 * exports.api, route POST /api/ai/draft-noting), which holds the key
 * server-side as a Firebase secret and calls api.anthropic.com itself.
 *
 * Deployment shape: frontend on Netlify, backend on Firebase Functions —
 * two different domains, so this is a real cross-origin call, not a
 * same-origin rewrite trick. VITE_API_BASE_URL MUST be set to the deployed
 * function's full URL (see .env.example for exactly how to get it) or
 * every AI-drafting call will fail and fall back to the local mock draft.
 * CORS is enabled on the Functions side to allow this.
 */

import { getAuthenticatedApiHeaders } from "./firebase";

const BACKEND_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export interface DraftNotingParams {
  letterSubject: string;
  letterContent: string;
  styleSample?: string;
}

export async function draftNotingWithAI({ letterSubject, letterContent, styleSample }: DraftNotingParams): Promise<string> {
  if (!BACKEND_BASE_URL) throw new Error("AI backend is not configured.");
  const response = await fetch(`${BACKEND_BASE_URL}/api/ai/draft-noting`, {
    method: "POST",
    headers: await getAuthenticatedApiHeaders(),
    body: JSON.stringify({ letterSubject, letterContent, styleSample }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Backend responded with ${response.status}`);
  }

  const data = await response.json();
  if (!data.draft) throw new Error("Backend response missing 'draft' field");
  return data.draft as string;
}
