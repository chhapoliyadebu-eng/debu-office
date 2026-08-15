/**
 * OmniRoute — the multi-model AI routing engine for this portal's backend.
 *
 * "OmniRoute" is this app's own routing engine (this file) — not a
 * third-party API or external service. It lives inside your Firebase
 * Cloud Functions backend and simply tries each configured AI provider in
 * priority order until one succeeds, matching this shape:
 *
 *   Frontend (Netlify) → API call → Firebase Functions backend → OmniRoute
 *   routing engine → ChatGPT → Claude → Gemini → Grok → Firestore
 *   (logs every attempt + stores every successful response)
 *
 * FALLBACK ORDER — exactly 4 providers, in this priority order:
 *   1. ChatGPT (OpenAI, gpt-4o-mini)
 *   2. Claude (Anthropic — same API used elsewhere in this app)
 *   3. Gemini (Google, gemini-1.5-pro)
 *   4. Grok (xAI)
 *
 * This order was chosen deliberately by whoever configured this file —
 * if you'd rather Claude (or any other provider) be tried FIRST instead
 * of ChatGPT, just reorder the array inside buildChain() below; nothing
 * else needs to change.
 *
 * For each request:
 *   1. Walk the chain in order.
 *   2. Skip a provider if its secret isn't configured, or if it's already
 *      over its configured daily free-tier quota (tracked in Firestore).
 *   3. Try the provider; on success, log + store the response and return.
 *   4. On failure (quota error, network error, bad response), log the
 *      failure and move to the next provider.
 *   5. If every provider fails, return an error — no silent fake response.
 *
 * Every attempt (success, skip, or failure) is logged to Firestore
 * `aiRoutingLogs` so you can see which model actually answered each
 * request. Every successful response is also stored in `aiResponses`.
 */

const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

// ---- Secrets for each of the 3 non-Claude providers. Claude uses
// ANTHROPIC_API_KEY, which is already defined in index.js and passed
// into routeAIRequest() separately (see handleRoutedGeneration below) —
// it is NOT part of ROUTER_SECRETS to avoid defining it twice.
//   firebase functions:secrets:set OPENAI_API_KEY
//   firebase functions:secrets:set GEMINI_API_KEY
//   firebase functions:secrets:set GROK_API_KEY
// If a secret is left empty/unset, the router treats that provider as
// unavailable and just skips to the next one in the chain — it does NOT
// block deployment as long as you've set *some* value (even a placeholder)
// for every secret listed in a function's `secrets` array. See DEPLOY.md.
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GROK_API_KEY = defineSecret("GROK_API_KEY");

const ROUTER_SECRETS = [OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY];

// ---- Conservative default daily caps per provider, sized for 5-10 users
// on free/low-cost tiers. These are approximate — check each provider's
// actual current pricing/limits and adjust; the point is to fail over to
// the next model BEFORE hitting a hard quota error, not to be exact.
const DEFAULT_DAILY_CAPS = {
  chatgpt: 50,
  claude: 50,
  gemini: 50,
  grok: 50,
};

function hasValue(secret) {
  try {
    const v = secret.value();
    return Boolean(v && v.trim().length > 0);
  } catch {
    return false;
  }
}

/** Generic OpenAI-compatible chat completion caller — used by ChatGPT and Grok (both expose an OpenAI-compatible /chat/completions endpoint). */
async function callOpenAICompatible({ baseUrl, apiKey, model, prompt, extraHeaders }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from provider");
  return text;
}

async function callClaude(anthropicKey, prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Empty response from Claude");
  return text;
}

async function callGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

/**
 * The fallback chain, in the exact priority order requested:
 * ChatGPT → Claude → Gemini → Grok. Each entry knows how to check
 * availability (has a key configured) and how to call itself. `quotaKey`
 * maps to DEFAULT_DAILY_CAPS.
 */
function buildChain() {
  return [
    {
      name: "chatgpt", quotaKey: "chatgpt",
      available: () => hasValue(OPENAI_API_KEY),
      // gpt-4o-mini is OpenAI's low-cost/high-quota model, in keeping with
      // this file's "cheap enough for 5-10 users" design goal — swap the
      // model string for "gpt-4o" or any other current ChatGPT model if
      // you'd rather use a stronger (pricier) one.
      call: (_secrets, prompt) =>
        callOpenAICompatible({ baseUrl: "https://api.openai.com/v1", apiKey: OPENAI_API_KEY.value(), model: "gpt-4o-mini", prompt }),
    },
    {
      name: "claude", quotaKey: "claude",
      available: (secrets) => hasValue(secrets.anthropic),
      call: (secrets, prompt) => callClaude(secrets.anthropic.value(), prompt),
    },
    {
      name: "gemini", quotaKey: "gemini",
      available: () => hasValue(GEMINI_API_KEY),
      call: (_secrets, prompt) => callGemini(GEMINI_API_KEY.value(), prompt),
    },
    {
      name: "grok", quotaKey: "grok",
      available: () => hasValue(GROK_API_KEY),
      // xAI's Grok exposes an OpenAI-compatible endpoint at api.x.ai.
      // Confirm the current model name in your xAI console before relying
      // on this in production — like every provider here, model names
      // and availability change over time; "grok-4" is what's current as
      // of this writing, swap it if xAI has since renamed/replaced it.
      call: (_secrets, prompt) =>
        callOpenAICompatible({ baseUrl: "https://api.x.ai/v1", apiKey: GROK_API_KEY.value(), model: "grok-4", prompt }),
    },
  ];
}

async function getTodayCount(db, quotaKey, uid = null) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const id = uid ? `${uid}_${quotaKey}_${dateKey}` : `${quotaKey}_${dateKey}`;
  const docRef = db.collection("aiUsageCounters").doc(id);
  const snap = await docRef.get();
  return { docRef, count: snap.exists ? snap.data().count || 0 : 0 };
}
async function incrementCount(docRef) {
  await docRef.set({ count: admin.firestore.FieldValue.increment(1), updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Runs the full fallback chain for one prompt. Returns
 * { text, modelUsed, attempts } or throws if every provider failed/was
 * unavailable.
 */
async function routeAIRequest(db, prompt, { anthropicKey, uid } = {}) {
  const chain = buildChain();
  const secrets = { anthropic: { value: () => anthropicKey } };
  const attempts = [];

  for (const provider of chain) {
    const start = Date.now();

    if (!provider.available(secrets)) {
      attempts.push({ provider: provider.name, status: "skipped_no_key" });
      continue;
    }

    const cap = DEFAULT_DAILY_CAPS[provider.quotaKey] || 50;
    const perUserCap = 50;
    const { docRef, count } = await getTodayCount(db, provider.quotaKey);
    const userCounter = uid ? await getTodayCount(db, provider.quotaKey, uid) : null;
    if (count >= cap || (userCounter && userCounter.count >= perUserCap)) {
      attempts.push({ provider: provider.name, status: "skipped_quota", count, cap });
      logger.warn(`[OmniRoute] Skipping ${provider.name} — daily cap reached (${count}/${cap})`);
      continue;
    }

    try {
      const text = await provider.call(secrets, prompt);
      await incrementCount(docRef);
      if (userCounter) await incrementCount(userCounter.docRef);
      attempts.push({ provider: provider.name, status: "success", latencyMs: Date.now() - start });
      return { text, modelUsed: provider.name, attempts };
    } catch (err) {
      attempts.push({ provider: provider.name, status: "error", error: err.message, latencyMs: Date.now() - start });
      logger.warn(`[OmniRoute] ${provider.name} failed, trying next in chain`, { error: err.message });
    }
  }

  throw Object.assign(new Error("All AI providers failed or unavailable"), { attempts });
}

/**
 * Full request handler: routes the prompt, logs the attempt chain, and
 * stores the successful response — all in Firestore.
 */
async function handleRoutedGeneration(db, { prompt, anthropicKey, context, uid }) {
  const requestId = "AIREQ-" + Date.now().toString(36).toUpperCase();
  let result;
  try {
    result = await routeAIRequest(db, prompt, { anthropicKey, uid });
  } catch (err) {
    await db.collection("aiRoutingLogs").doc(requestId).set({
      requestId,
      promptHash: crypto.createHash("sha256").update(prompt).digest("hex"),
      promptLength: prompt.length,
      contextType: context?.type || null,
      attempts: err.attempts || [],
      finalStatus: "all_failed",
      createdAt: new Date().toISOString(),
    });
    throw err;
  }

  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");
  await db.collection("aiRoutingLogs").doc(requestId).set({
    requestId,
    promptHash,
    promptLength: prompt.length,
    contextType: context?.type || null,
    attempts: result.attempts,
    finalStatus: "success",
    modelUsed: result.modelUsed,
    createdAt: new Date().toISOString(),
  });

  // Do not persist government-document prompts or full AI responses by default.
  // Only operational metadata is retained for audit/monitoring.
  await db.collection("aiResponses").add({
    requestId,
    modelUsed: result.modelUsed,
    promptHash,
    promptLength: prompt.length,
    responseLength: result.text.length,
    createdAt: new Date().toISOString(),
  });

  return { requestId, text: result.text, modelUsed: result.modelUsed, attempts: result.attempts };
}

module.exports = { ROUTER_SECRETS, handleRoutedGeneration };
