/**
 * Haryana Roadways Drafting Portal — Backend (Firebase Cloud Functions)
 *
 * Deployment shape: FRONTEND on Netlify, BACKEND (this file) + DATABASE on
 * Firebase (Cloud Functions + Firestore). Since frontend and backend live on
 * different domains, every route below is called by its FULL absolute
 * Cloud Function URL from the frontend (see src/lib/claudeApi.ts and
 * src/lib/mailboxApi.ts, VITE_API_BASE_URL) — there's no same-origin
 * rewrite trick here (that only works if Firebase Hosting serves the
 * frontend, which it doesn't in this setup). CORS is enabled below so the
 * Netlify domain can call this Cloud Function domain directly.
 *
 * Two exports:
 *   1. `api`             — Express app, deployed as one HTTPS Cloud Function.
 *                          Implements:
 *                            POST /api/ai/draft-noting        — AI drafting proxy (via OmniRoute)
 *                            POST /api/ai/generate             — general-purpose AI generation (via OmniRoute)
 *                            POST /api/mailbox/connect        — connect an office mailbox (43A) — admin/department-admin only
 *                            GET  /api/mailbox/:id/inbox      — fetch that mailbox's inbox
 *                            POST /api/mailbox/:id/send       — send mail as that office ID
 *                            POST /api/mailbox/:id/disconnect — disconnect it, freeing the slot for another
 *   2. `scrapeCirculars` — scheduled job scaffold for the CS Haryana + Finance
 *                          Department Haryana circular sync (Section 25).
 *
 * AI routing engine: see omniRoute.js ("OmniRoute") — tries ChatGPT →
 * Claude → Gemini → Grok, in that order, skipping any provider without a
 * configured key or over its daily quota. Every attempt and every
 * successful response is logged to Firestore (aiRoutingLogs, aiResponses,
 * aiUsageCounters).
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const crypto = require("crypto");
const imaps = require("imap-simple");
const nodemailer = require("nodemailer");
const { simpleParser } = require("mailparser");
const { ROUTER_SECRETS, handleRoutedGeneration } = require("./omniRoute");

admin.initializeApp();
const db = admin.firestore();

// Set with: firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Set with: firebase functions:secrets:set MAILBOX_ENC_KEY
// Generate a value with: openssl rand -hex 32
const MAILBOX_ENC_KEY = defineSecret("MAILBOX_ENC_KEY");

// ---------------------------------------------------------------------------
// Security middleware stack — applied in order: Helmet (headers) → CORS
// (origin lock-down) → rate limiting → JSON body parsing (with size limit).
// ---------------------------------------------------------------------------

// Set the exact deployed frontend origin before deploying, e.g.
// firebase functions:config:set is no longer used here; defineString is
// backed by Firebase parameter configuration. Never leave this blank in
// production. Multiple origins may be comma-separated only when required.
const ALLOWED_ORIGIN = defineString("ALLOWED_ORIGIN", { default: "" });
// Note: there used to be an ALLOWED_EMAIL_DOMAIN parameter here that
// restricted LOGIN to an official government email domain. That
// restriction has been removed by design — login now works with any
// verified email (personal or official); see the comment in requireAuth
// below for how account approval works instead. The office MAILBOX
// (a separate feature) is still always an official government email,
// entered directly by a Department Admin/Admin when connecting it.

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS is fail-closed in production. Set ALLOWED_ORIGIN to the exact
// Netlify/custom domain (comma-separated only if multiple trusted frontends
// are genuinely required). Never use * for this authenticated API.
app.use((req, res, next) => {
  const configured = ALLOWED_ORIGIN.value()
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = req.get("Origin");
  if (!origin) return next();

  if (!configured.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  return cors({
    origin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Firebase-AppCheck"],
    credentials: false,
    maxAge: 600,
  })(req, res, next);
});

app.options("*", (req, res) => res.sendStatus(204));

app.use(express.json({ limit: "100kb" }));

// ---------------------------------------------------------------------------
// Firebase Authentication + server-side authorization
// ---------------------------------------------------------------------------
async function requireAuth(req, res, next) {
  try {
    const header = req.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const decoded = await admin.auth().verifyIdToken(token, true);
    const email = String(decoded.email || "").trim().toLowerCase();
    // Login is intentionally NOT restricted to an official email domain —
    // any signed-in, email-verified account can authenticate here. The
    // official/government identity check happens separately and later:
    // a brand-new account starts with role "USER" and department
    // "Unassigned" (see getProfile below / firestore.rules), and cannot
    // do anything meaningful until a trusted DEPARTMENT_ADMIN/ADMIN
    // reviews and approves it via PATCH /api/users/:uid. The OFFICE
    // mailbox (a separate feature — see /api/mailbox/connect) is what
    // actually requires an official government email address, since
    // that's the real government identity that matters for correspondence.
    if (!decoded.email_verified || !email) {
      return res.status(403).json({ error: "An authenticated, verified email account is required" });
    }

    const profile = await getProfile(decoded.uid);
    if (!profile) {
      return res.status(403).json({ error: "Portal profile is not provisioned" });
    }
    if (profile.disabled === true) {
      return res.status(403).json({ error: "Portal account is disabled" });
    }
    const claimRole = decoded.role || "USER";
    const profileRole = profile.role || "USER";
    if (claimRole !== profileRole) {
      return res.status(403).json({ error: "Authorization profile is out of sync. Please sign in again." });
    }

    req.user = decoded;
    req.profile = profile;
    next();
  } catch (err) {
    logger.warn("Authentication failed", { code: err.code || "unknown" });
    return res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

async function getProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function roleOf(req) {
  return req.user?.role || "USER";
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(roleOf(req))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * Access to a given office mailbox's inbox/send is granted to:
 *   - ADMIN / DEPARTMENT_ADMIN (oversight — any office mailbox), or
 *   - a USER who has explicitly JOINED that mailbox (see /join and /leave
 *     below). Any number of users may join the same office mailbox — a
 *     branch/depot can have many officers sharing one inbox — but each USER
 *     may be joined to only ONE office mailbox at a time (enforced in
 *     /join, not here).
 */
async function requireMailboxAccess(req, res, next) {
  try {
    const accountId = req.params.accountId;
    const snap = await db.collection("mailAccounts").doc(accountId).get();
    if (!snap.exists) return res.status(404).json({ error: "Mailbox not found" });

    const account = snap.data() || {};
    if (["ADMIN", "DEPARTMENT_ADMIN"].includes(roleOf(req))) {
      req.mailAccount = account;
      return next();
    }

    const memberUids = Array.isArray(account.memberUids) ? account.memberUids : [];
    if (!memberUids.includes(req.user.uid)) {
      return res.status(403).json({ error: "You have not connected to this office mailbox. Join it from Mailbox Settings first." });
    }

    req.mailAccount = account;
    next();
  } catch (err) {
    logger.error("Mailbox authorization failed", { error: err.message });
    return res.status(500).json({ error: "Unable to verify mailbox permissions" });
  }
}



async function writeAudit(req, action, targetType, targetId, details = {}) {
  try {
    await db.collection("auditLog").add({
      actorUid: req.user.uid,
      actorRole: roleOf(req),
      action,
      targetType,
      targetId: String(targetId || ""),
      department: details.department || req.profile?.department || null,
      seat: details.seat || req.profile?.seat || null,
      success: details.success !== false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: details.metadata || null,
    });
  } catch (err) {
    // Audit failures are logged but never exposed to the client as a way to
    // forge or alter audit records.
    logger.error("Audit write failed", { action, error: err.message });
  }
}

// Identity-based in-memory limiter: unlike the old IP-only limiter, one
// user's requests cannot consume another user's allowance. This is backed by
// App Check + authenticated UID. The expensive AI/mailbox routes also use a
// distributed Firestore limiter below, so multiple Cloud Function instances
// cannot bypass the hard quota.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many AI requests, please slow down." },
});

const mailboxConnectLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many mailbox-connect attempts, try again later." },
});

function distributedRateLimit({ collection, windowMs, limit }) {
  return async (req, res, next) => {
    try {
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const key = `${req.user.uid}_${windowStart}`;
      const ref = db.collection(collection).doc(key);

      let count = 0;
      let blocked = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        count = snap.exists ? Number(snap.data().count || 0) : 0;
        if (count >= limit) {
          blocked = true;
          return;
        }
        tx.set(ref, {
          uid: req.user.uid,
          count: count + 1,
          windowStart,
          expiresAt: new Date(windowStart + windowMs + 60_000).toISOString(),
        }, { merge: true });
        count += 1;
      });

      if (blocked || count > limit) {
        return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
      }
      next();
    } catch (err) {
      logger.error("Distributed rate limiter failed", { error: err.message });
      return res.status(503).json({ error: "Rate-limit service temporarily unavailable" });
    }
  };
}

// Every API route is authenticated. Firebase App Check is enforced at the
// Cloud Function export below as an additional anti-abuse control.
app.use(requireAuth);
app.use(generalLimiter); // small limit — this API only ever accepts short text fields, never file uploads

/**
 * Generic "validate this request body against a Zod schema" middleware.
 * Rejects with 400 + a clear field-level error before the handler ever
 * touches the data — prevents malformed/oversized/wrong-typed input from
 * reaching Firestore, IMAP/SMTP, or the AI providers.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request body", details: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    req.body = result.data;
    next();
  };
}

// Extracted into lib/validationSchemas.js (no Firebase dependency) so
// these can be unit tested directly — see test/validationSchemas.test.js.
const {
  draftNotingSchema,
  generateSchema,
  mailboxConnectSchema,
  fileMoveSchema,
  mailboxSendSchema,
  updateUserSchema,
  shareSchema,
  rtiSearchSchema,
} = require("./lib/validationSchemas");

/**
 * POST /api/ai/draft-noting
 * Body: { letterSubject: string, letterContent: string, styleSample?: string }
 * Response: { draft: string }
 *
 * This is the ONLY place the Claude API key is used — it never reaches the
 * browser (Section 31/32 compliance). Swap the model name / prompt / add
 * more AI routes (e.g. draft-letter, draft-endorsement) here as needed.
 * Routed through OmniRoute (omniRoute.js) — tries ChatGPT → Claude →
 * Gemini → Grok in order, skipping whichever is unavailable/over
 * quota/erroring. Response is JSON (for the React
 * frontend), and every attempt + the final response are logged to
 * Firestore (aiRoutingLogs, aiResponses).
 *
 * If `styleSample` is provided (a piece of writing the user themselves
 * authored, pasted or picked from their saved samples — see
 * src/components/StyleSamplePanel.tsx), it's included as a few-shot
 * reference so the draft matches THEIR phrasing/tone/structure rather than
 * a generic one. The sample is never presented to the model as content to
 * summarize — only as a style reference — so it can't leak into the facts
 * of the new draft.
 */
app.post("/api/ai/draft-noting", aiLimiter, distributedRateLimit({ collection: "apiRateLimitsAI", windowMs: 15 * 60 * 1000, limit: 60 }), validateBody(draftNotingSchema), async (req, res) => {
  try {
    const { letterSubject, letterContent, styleSample } = req.body || {};
    if (!letterSubject || !letterContent) {
      return res.status(400).json({ error: "letterSubject and letterContent are required" });
    }

    const styleBlock =
      styleSample && String(styleSample).trim()
        ? `\n\nSTYLE REFERENCE — match the tone, phrasing, sentence length, and structural habits of the following sample text (this is the officer's own past writing, provided ONLY as a style guide — do not copy its facts or subject matter into the new draft):\n"""\n${String(styleSample).slice(0, 4000)}\n"""\n`
        : "";

    const prompt = `You are assisting a Haryana Roadways (Transport Department) officer in drafting an official file noting.
Received letter subject: "${letterSubject}"
Received letter content: "${letterContent}"
${styleBlock}
Draft a concise 4-part noting (facts, analysis, suggestions, conclusion) in formal Indian government office language${styleSample ? ", written in the style shown in the STYLE REFERENCE above" : ""}. Return ONLY the four paragraphs separated by a blank line, no headings, no preamble.`;

    const result = await handleRoutedGeneration(db, {
      prompt,
      anthropicKey: ANTHROPIC_API_KEY.value(),
      context: { type: "draft-noting", letterSubject, usedStyleSample: Boolean(styleSample) },
      uid: req.user.uid,
    });

    await writeAudit(req, "AI_DRAFT_NOTING", "aiRequest", result.requestId, {
      metadata: { modelUsed: result.modelUsed, subject: letterSubject.slice(0, 120) }
    });
    res.json({ draft: result.text, modelUsed: result.modelUsed, requestId: result.requestId });
  } catch (err) {
    logger.error("draft-noting failed on every model in the chain", { error: err.message, attempts: err.attempts });
    res.status(502).json({ error: "AI service is temporarily unavailable. Please try again later." });
  }
});

/**
 * POST /api/ai/generate
 * Body: { prompt: string, context?: object, styleSample?: string }
 * Response: { response: string, modelUsed: string, requestId: string }
 *
 * General-purpose version of the same router, for any other AI text needs
 * beyond noting drafts (e.g. letter/endorsement drafting, summarization).
 * Also supports the "write in my style" sticky sample, same as
 * draft-noting — pass a user's saved/active style sample as `styleSample`
 * and it's included as a style-only few-shot reference.
 */
app.post("/api/ai/generate", aiLimiter, distributedRateLimit({ collection: "apiRateLimitsAI", windowMs: 15 * 60 * 1000, limit: 60 }), validateBody(generateSchema), async (req, res) => {
  try {
    const { prompt, context, styleSample } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt (string) is required" });
    }

    const finalPrompt =
      styleSample && String(styleSample).trim()
        ? `${prompt}\n\nSTYLE REFERENCE — match the tone, phrasing, sentence length, and structural habits of the following sample text (provided ONLY as a style guide — do not copy its facts or subject matter):\n"""\n${String(styleSample).slice(0, 4000)}\n"""\n`
        : prompt;

    const result = await handleRoutedGeneration(db, { prompt: finalPrompt, anthropicKey: ANTHROPIC_API_KEY.value(), context, uid: req.user.uid });
    await writeAudit(req, "AI_GENERATE", "aiRequest", result.requestId, {
      metadata: { modelUsed: result.modelUsed }
    });
    res.json({ response: result.text, modelUsed: result.modelUsed, requestId: result.requestId });
  } catch (err) {
    logger.error("ai/generate failed on every model in the chain", { error: err.message, attempts: err.attempts });
    res.status(502).json({ error: "AI service is temporarily unavailable. Please try again later." });
  }
});



/**
 * POST /api/files/:fileId/move
 * Appends an immutable movement event and updates the current seat atomically.
 */
app.post("/api/files/:fileId/move", distributedRateLimit({ collection: "apiRateLimitsFiles", windowMs: 15 * 60 * 1000, limit: 60 }), validateBody(fileMoveSchema), async (req, res) => {
  try {
    const profile = await getProfile(req.user.uid);
    if (!profile?.seat || profile.seat === "Unassigned") return res.status(403).json({ error: "Seat assignment required" });
    const fileRef = db.collection("files").doc(req.params.fileId);
    const movementRef = db.collection("fileMovements").doc();
    const snap = await fileRef.get();
    if (!snap.exists) return res.status(404).json({ error: "File not found" });
    const file = snap.data() || {};
    const allowed = roleOf(req) === "ADMIN"
      || (file.ownerUid === req.user.uid)
      || (roleOf(req) === "DEPARTMENT_ADMIN" && file.department === profile.department);
    if (!allowed) return res.status(403).json({ error: "Not authorized to move this file" });

    const movement = {
      id: movementRef.id,
      fileId: req.params.fileId,
      fromSeat: file.currentSeat || file.branch || profile.seat,
      toSeat: req.body.toSeat,
      actorUid: req.user.uid,
      actorRole: roleOf(req),
      remarks: req.body.remarks || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.update(fileRef, { currentSeat: req.body.toSeat, updatedAt: new Date().toISOString() });
    batch.set(movementRef, movement);
    await batch.commit();
    await writeAudit(req, "FILE_MOVED", "file", req.params.fileId, { seat: req.body.toSeat });
    res.json({ moved: true, movementId: movementRef.id });
  } catch (err) {
    logger.error("file/move failed", { error: err.message });
    res.status(500).json({ error: "Unable to move file" });
  }
});

/**
 * ---------------------------------------------------------------------------
 * Office Mailbox routes (Section 43A)
 *
 * These connect an OFFICE mailbox (e.g. rto.ambala@hry.gov.in) — separate
 * from a user's personal login — so its inbox can be viewed and mail sent
 * from it inside the portal, scoped to a branch/seat per Section 43A.
 *
 * SECURITY: credentials are encrypted with AES-256-GCM using MAILBOX_ENC_KEY
 * (a Firebase secret, never in code or the frontend) and stored in the
 * `mailAccountSecrets` collection, which firestore.rules blocks the client
 * from ever reading directly — only these Cloud Functions (via the Admin
 * SDK, which bypasses security rules) can read them. The `mailAccounts`
 * collection the frontend reads only ever contains metadata (email,
 * branch, status) — never the password.
 * ---------------------------------------------------------------------------
 */

function encrypt(text, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("MAILBOX_ENC_KEY must be exactly 32 bytes / 64 hex characters");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(payload, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("MAILBOX_ENC_KEY must be exactly 32 bytes / 64 hex characters");
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * POST /api/mailbox/connect
 * Body: { branchOrSeat, officeEmail, imapHost, imapPort, smtpHost, smtpPort, username, password, connectedBy }
 * Response: { accountId }
 *
 * Multiple office mailboxes may exist at once (one per branch/depot) so
 * different offices can each run their own — but the SAME branch/office
 * cannot be connected twice (see the uniqueness check below). Individual
 * officers don't connect credentials themselves; they JOIN an already-
 * connected office mailbox via /join once a DEPARTMENT_ADMIN/ADMIN has set
 * it up here.
 */

const userManageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many user-management requests, try again later." },
});

/**
 * PATCH /api/users/:uid
 *
 * Every Admin-Panel "Users" edit goes through here (not a direct client
 * Firestore write) for two reasons: (1) it's the only way to get a proper
 * actor-attributed audit log entry — a raw client SDK write has no server
 * to log from — and (2) it lets DEPARTMENT_ADMIN manage users WITHOUT
 * giving them Firestore-level write access to the whole `users` collection.
 *
 * ADMIN: can edit any user's designation/wing/department/seat/role.
 * DEPARTMENT_ADMIN: can edit designation/wing/seat only, ONLY for a target
 *   who is currently role "USER" and already in their department OR still
 *   "Unassigned" (i.e. onboarding a brand-new sign-up into their own
 *   department for the first time) — and can never change `role` or move
 *   someone into a different department than their own. This is what lets
 *   a depot/wing admin onboard their own officers without a single global
 *   ADMIN account having to hand-process all ~700 of them.
 */
app.patch("/api/users/:uid", userManageLimiter, requireRole("DEPARTMENT_ADMIN", "ADMIN"), validateBody(updateUserSchema), async (req, res) => {
  try {
    const { uid } = req.params;
    const targetRef = db.collection("users").doc(uid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return res.status(404).json({ error: "User not found" });
    const target = targetSnap.data() || {};

    const patch = req.body || {};
    const isAdmin = roleOf(req) === "ADMIN";
    const actingProfile = req.profile || await getProfile(req.user.uid);

    if (!isAdmin) {
      // DEPARTMENT_ADMIN guardrails — enforced here even though the
      // Firestore rules below also enforce an equivalent boundary as
      // defense-in-depth for any future direct-write code path.
      if (patch.role && patch.role !== "USER") {
        return res.status(403).json({ error: "Only ADMIN can assign DEPARTMENT_ADMIN or ADMIN roles" });
      }
      if (target.role !== "USER") {
        return res.status(403).json({ error: "Department admins can only edit USER-role accounts" });
      }
      const myDept = actingProfile?.department;
      if (!myDept || myDept === "Unassigned") {
        return res.status(403).json({ error: "Your own department must be set before you can manage other users" });
      }
      if (target.department !== myDept && target.department !== "Unassigned") {
        return res.status(403).json({ error: "You can only manage users already in your department, or brand-new unassigned sign-ups" });
      }
      if (patch.department && patch.department !== myDept) {
        return res.status(403).json({ error: "You can only assign users into your own department" });
      }
      delete patch.role; // never touched by a dept admin, even if explicitly "USER" was sent
      if (!patch.department) patch.department = myDept; // onboarding an Unassigned user must land in the admin's own department
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    await targetRef.set(patch, { merge: true });
    await writeAudit(req, "USER_UPDATED", "user", uid, { metadata: { fields: Object.keys(patch), before: { role: target.role, department: target.department, wing: target.wing, designation: target.designation, seat: target.seat } } });

    res.json({ updated: true, uid, patch });
  } catch (err) {
    logger.error("users/update failed", err);
    res.status(500).json({ error: err.message || "Update failed" });
  }
});

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many admin actions, try again later." },
});

/**
 * These routes exist so that verifying/rejecting a rule or payment, and
 * publishing/dismissing a scraped circular, get a real actor-attributed
 * entry in the Firestore `auditLog` collection — a direct client SDK write
 * has no server to log from, so those actions were previously invisible in
 * the Admin Panel's Audit Log tab despite being safety/compliance-critical
 * (UTR payment verification, rule verification). `firestore.rules` no
 * longer allows the client to move a rule/payment out of PENDING directly
 * — these backend routes are the only path now (see firestore.rules).
 */

app.post("/api/rules/:id/verify", adminActionLimiter, requireRole("ADMIN"), async (req, res) => {
  try {
    const ref = db.collection("rules").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Rule not found" });
    if (snap.data().status !== "PENDING_VERIFICATION") return res.status(409).json({ error: "Rule is not pending verification" });

    const profile = req.profile || await getProfile(req.user.uid);
    await ref.set({ status: "VERIFIED", verifiedBy: profile?.name || req.user.email, verifiedAt: new Date().toISOString().slice(0, 10) }, { merge: true });
    await writeAudit(req, "VERIFIED_RULE", "rule", req.params.id);
    res.json({ verified: true });
  } catch (err) {
    logger.error("rules/verify failed", err);
    res.status(500).json({ error: err.message || "Verify failed" });
  }
});

app.post("/api/rules/:id/reject", adminActionLimiter, requireRole("ADMIN"), async (req, res) => {
  try {
    const ref = db.collection("rules").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Rule not found" });
    if (snap.data().status !== "PENDING_VERIFICATION") return res.status(409).json({ error: "Rule is not pending verification" });

    await ref.set({ status: "REJECTED" }, { merge: true });
    await writeAudit(req, "REJECTED_RULE", "rule", req.params.id);
    res.json({ rejected: true });
  } catch (err) {
    logger.error("rules/reject failed", err);
    res.status(500).json({ error: err.message || "Reject failed" });
  }
});

app.post("/api/payments/:id/verify", adminActionLimiter, requireRole("ADMIN"), async (req, res) => {
  try {
    const ref = db.collection("paymentVerifications").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Payment record not found" });
    if (snap.data().status !== "PENDING") return res.status(409).json({ error: "Payment is not pending" });

    await ref.set({ status: "VERIFIED" }, { merge: true });
    await writeAudit(req, "VERIFIED_PAYMENT", "payment", req.params.id);
    res.json({ verified: true });
  } catch (err) {
    logger.error("payments/verify failed", err);
    res.status(500).json({ error: err.message || "Verify failed" });
  }
});

app.post("/api/payments/:id/reject", adminActionLimiter, requireRole("ADMIN"), async (req, res) => {
  try {
    const ref = db.collection("paymentVerifications").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Payment record not found" });
    if (snap.data().status !== "PENDING") return res.status(409).json({ error: "Payment is not pending" });

    await ref.set({ status: "REJECTED" }, { merge: true });
    await writeAudit(req, "REJECTED_PAYMENT", "payment", req.params.id);
    res.json({ rejected: true });
  } catch (err) {
    logger.error("payments/reject failed", err);
    res.status(500).json({ error: err.message || "Reject failed" });
  }
});

/**
 * POST /api/circulars/:id/publish
 * Turns a PENDING_REVIEW circular into a new VERIFIED rule in one atomic
 * batch — this is the only place a rule may be *created* already-VERIFIED
 * (the client can only ever create a rule as PENDING_VERIFICATION, see
 * firestore.rules), which is why this always went through the backend.
 */
app.post("/api/circulars/:id/publish", adminActionLimiter, requireRole("ADMIN"), async (req, res) => {
  try {
    const circRef = db.collection("circulars").doc(req.params.id);
    const circSnap = await circRef.get();
    if (!circSnap.exists) return res.status(404).json({ error: "Circular not found" });
    const circ = circSnap.data();
    if (circ.status !== "PENDING_REVIEW") return res.status(409).json({ error: "Circular is not pending review" });

    const profile = req.profile || await getProfile(req.user.uid);
    const ruleId = "RULE-" + Date.now().toString(36).toUpperCase();
    const ruleRef = db.collection("rules").doc(ruleId);

    const batch = db.batch();
    batch.set(ruleRef, {
      id: ruleId,
      category: circ.source === "FINANCE_HARYANA" ? "Haryana Passengers and Goods Taxation Act & Rules" : "RTA circulars & permit instructions",
      title: circ.title,
      sourceNote: circ.sourceUrl,
      fullText: circ.summary,
      status: "VERIFIED",
      uploadedBy: `${circ.source} Scraper`,
      uploadedAt: circ.fetchedAt,
      verifiedBy: profile?.name || req.user.email,
      verifiedAt: new Date().toISOString().slice(0, 10),
      origin: "CIRCULAR_SCRAPE",
    });
    batch.set(circRef, { status: "PUBLISHED" }, { merge: true });
    await batch.commit();

    await writeAudit(req, "PUBLISHED_CIRCULAR", "circular", req.params.id, { metadata: { ruleId } });
    res.json({ published: true, ruleId });
  } catch (err) {
    logger.error("circulars/publish failed", err);
    res.status(500).json({ error: err.message || "Publish failed" });
  }
});

app.post("/api/circulars/:id/dismiss", adminActionLimiter, requireRole("DEPARTMENT_ADMIN", "ADMIN"), async (req, res) => {
  try {
    const ref = db.collection("circulars").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Circular not found" });
    if (snap.data().status !== "PENDING_REVIEW") return res.status(409).json({ error: "Circular is not pending review" });

    await ref.set({ status: "DISMISSED" }, { merge: true });
    await writeAudit(req, "DISMISSED_CIRCULAR", "circular", req.params.id);
    res.json({ dismissed: true });
  } catch (err) {
    logger.error("circulars/dismiss failed", err);
    res.status(500).json({ error: err.message || "Dismiss failed" });
  }
});

/**
 * GET /api/directory
 * Returns a minimal colleague list (uid, name, seat, designation — no
 * email, no role, no other profile fields) for the caller's own
 * department, so the "Share document" picker in DocumentEditor can offer
 * REAL registered officers instead of the old hardcoded demo-user list.
 * Deliberately minimal fields: this is a lookup for picking a share
 * target, not a general profile-read endpoint (that stays gated by
 * firestore.rules' much stricter per-uid/department-admin rules).
 */
app.get("/api/directory", async (req, res) => {
  try {
    const profile = req.profile || await getProfile(req.user.uid);
    if (!profile || !profile.department || profile.department === "Unassigned") {
      return res.json({ colleagues: [] });
    }
    const snap = await db.collection("users").where("department", "==", profile.department).limit(500).get();
    const colleagues = snap.docs
      .filter((d) => d.id !== req.user.uid)
      .map((d) => {
        const u = d.data();
        return { uid: d.id, name: u.name || "Unnamed", seat: u.seat || "", designation: u.designation || "" };
      });
    res.json({ colleagues });
  } catch (err) {
    logger.error("directory failed", err);
    res.status(500).json({ error: err.message || "Directory lookup failed" });
  }
});

/**
 * Mirrors the read boundary in firestore.rules' `attachments` match block
 * exactly (uploader, ADMIN, same-department DEPARTMENT_ADMIN, or access to
 * the linked document via ownership/dept-admin/sharedWith) — this is what
 * gates who gets a signed download URL.
 */
async function canReadAttachment(attachment, req) {
  if (roleOf(req) === "ADMIN") return true;
  if (attachment.uploadedBy === req.user.uid) return true;

  const profile = req.profile || await getProfile(req.user.uid);
  if (roleOf(req) === "DEPARTMENT_ADMIN" && profile?.department && profile.department === attachment.department) return true;

  if (attachment.linkedType === "document") {
    const docSnap = await db.collection("documents").doc(attachment.linkedId).get();
    if (docSnap.exists) {
      const doc = docSnap.data();
      if (doc.ownerUid === req.user.uid) return true;
      if (roleOf(req) === "DEPARTMENT_ADMIN" && profile?.department && doc.department === profile.department) return true;
      if (doc.sharedWith && doc.sharedWith[req.user.uid]) return true;
    }
  }
  return false;
}

const attachmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many attachment requests, try again later." },
});

/**
 * GET /api/attachments/:id/download-url
 * The Storage object itself is never made directly readable to a shared
 * colleague (storage.rules only grants direct read to the uploader, and to
 * DEPARTMENT_ADMIN/ADMIN via custom claims) — this route is what lets a
 * document's OTHER authorized viewers (e.g. someone it was shared with)
 * actually download an attachment: it checks the same access rules as
 * firestore.rules, then hands back a short-lived (5 minute) signed URL
 * using the Admin SDK, which bypasses Storage rules entirely.
 */
app.get("/api/attachments/:id/download-url", attachmentLimiter, async (req, res) => {
  try {
    const snap = await db.collection("attachments").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Attachment not found" });
    const attachment = snap.data();

    if (!(await canReadAttachment(attachment, req))) {
      return res.status(403).json({ error: "You don't have access to this attachment" });
    }

    const bucket = admin.storage().bucket();
    const [url] = await bucket.file(attachment.storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });
    res.json({ url, expiresInSeconds: 300 });
  } catch (err) {
    logger.error("attachments/download-url failed", err);
    res.status(500).json({ error: err.message || "Could not generate a download link" });
  }
});

/**
 * DELETE /api/attachments/:id
 * Only the uploader or ADMIN may delete. Removes BOTH the Storage object
 * and the Firestore pointer — firestore.rules blocks a client-only delete
 * specifically so this can't happen (a client-only delete would leave an
 * orphaned file sitting in Storage forever, invisible to everyone but
 * still consuming space and never cleaned up).
 */
app.delete("/api/attachments/:id", attachmentLimiter, async (req, res) => {
  try {
    const ref = db.collection("attachments").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Attachment not found" });
    const attachment = snap.data();

    const isOwner = attachment.uploadedBy === req.user.uid;
    let isSameDeptAdmin = false;
    if (!isOwner && roleOf(req) === "DEPARTMENT_ADMIN") {
      const profile = req.profile || await getProfile(req.user.uid);
      isSameDeptAdmin = !!profile?.department && profile.department === attachment.department;
    }

    if (!isOwner && roleOf(req) !== "ADMIN" && !isSameDeptAdmin) {
      return res.status(403).json({ error: "Only the person who uploaded this file, their Department Admin, or an ADMIN can delete it" });
    }

    const bucket = admin.storage().bucket();
    await bucket.file(attachment.storagePath).delete({ ignoreNotFound: true });
    await ref.delete();
    await writeAudit(req, "DELETED_ATTACHMENT", "attachment", req.params.id, { metadata: { fileName: attachment.fileName } });
    res.json({ deleted: true });
  } catch (err) {
    logger.error("attachments/delete failed", err);
    res.status(500).json({ error: err.message || "Delete failed" });
  }
});

const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many sharing requests, try again later." },
});


/**
 * POST /api/documents/:id/share
 * Only the document's OWNER (or ADMIN) may share it. Writes to
 * `documents/{id}.sharedWith` — this is the field firestore.rules'
 * canAccess() actually checks, so this is what makes a shared colleague
 * able to open (and, for EDIT, save changes to) the document. Direct
 * client writes to `sharedWith` are blocked in firestore.rules — this
 * route is the only path, so every share gets a proper audit-log entry
 * (who shared what, with whom, at what permission level).
 */
app.post("/api/documents/:id/share", shareLimiter, validateBody(shareSchema), async (req, res) => {
  try {
    const { targetUid, permission } = req.body;
    const ref = db.collection("documents").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Document not found" });
    const doc = snap.data();

    if (roleOf(req) !== "ADMIN" && doc.ownerUid !== req.user.uid) {
      return res.status(403).json({ error: "Only the document's owner can share it" });
    }
    if (targetUid === doc.ownerUid) {
      return res.status(400).json({ error: "Document owner already has full access" });
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) return res.status(404).json({ error: "That user does not exist" });

    const profile = req.profile || await getProfile(req.user.uid);
    await ref.set({
      sharedWith: {
        ...(doc.sharedWith || {}),
        [targetUid]: { permission, sharedAt: new Date().toISOString(), sharedBy: profile?.name || req.user.email },
      },
    }, { merge: true });

    await writeAudit(req, "SHARED_DOCUMENT", "document", req.params.id, { metadata: { targetUid, permission } });
    res.json({ shared: true });
  } catch (err) {
    logger.error("documents/share failed", err);
    res.status(500).json({ error: err.message || "Share failed" });
  }
});

app.post("/api/documents/:id/unshare", shareLimiter, async (req, res) => {
  try {
    const targetUid = req.body?.targetUid;
    if (!targetUid) return res.status(400).json({ error: "targetUid is required" });

    const ref = db.collection("documents").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Document not found" });
    const doc = snap.data();

    if (roleOf(req) !== "ADMIN" && doc.ownerUid !== req.user.uid) {
      return res.status(403).json({ error: "Only the document's owner can revoke sharing" });
    }

    await ref.set({ sharedWith: { [targetUid]: admin.firestore.FieldValue.delete() } }, { merge: true });
    await writeAudit(req, "UNSHARED_DOCUMENT", "document", req.params.id, { metadata: { targetUid } });
    res.json({ unshared: true });
  } catch (err) {
    logger.error("documents/unshare failed", err);
    res.status(500).json({ error: err.message || "Unshare failed" });
  }
});

const rtiSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many RTI search logs, try again later." },
});


/**
 * POST /api/search/log-rti
 * The "RTI-flagged search" checkbox in Global Search claims a search is
 * "logged separately for RTI audit purposes" — this is the route that
 * actually makes that true. Before this existed, the checkbox did nothing
 * at all: no request was ever sent anywhere, so an officer relying on it
 * to document a thorough RTI search would have had no real record to show.
 * The frontend calls this once per explicit "Log this search" action (not
 * on every keystroke) with the query text and how many results came back
 * in each category, so there's a genuine record: who searched what, when,
 * and what was found.
 */
app.post("/api/search/log-rti", rtiSearchLimiter, validateBody(rtiSearchSchema), async (req, res) => {
  try {
    await writeAudit(req, "RTI_SEARCH_LOGGED", "search", req.body.query.slice(0, 100), { metadata: { query: req.body.query, resultCounts: req.body.resultCounts } });
    res.json({ logged: true });
  } catch (err) {
    logger.error("search/log-rti failed", err);
    res.status(500).json({ error: err.message || "Could not log this search" });
  }
});

app.post("/api/mailbox/connect", mailboxConnectLimiter, distributedRateLimit({ collection: "apiRateLimitsMailbox", windowMs: 60 * 60 * 1000, limit: 5 }), requireRole("DEPARTMENT_ADMIN", "ADMIN"), validateBody(mailboxConnectSchema), async (req, res) => {
  try {
    const { branchOrSeat, officeEmail, imapHost, imapPort, smtpHost, smtpPort, username, password } = req.body || {};
    if (!officeEmail || !imapHost || !username || !password) {
      return res.status(400).json({ error: "officeEmail, imapHost, username, and password are required" });
    }

    const normalizedBranch = String(branchOrSeat || "").trim().toLowerCase();

    // One mailbox PER OFFICE/BRANCH — not one system-wide. A different
    // branch is free to connect its own mailbox; the same branch name
    // cannot be connected twice while an existing one is still active.
    const existingSnap = await db.collection("mailAccounts").where("branchOrSeatNormalized", "==", normalizedBranch).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(409).json({ error: "This office/branch already has a connected mailbox. Disconnect it before connecting a different one for the same office." });
    }

    const accountId = "MBOX-" + Date.now().toString(36).toUpperCase();
    const secretPayload = JSON.stringify({ imapHost, imapPort, smtpHost, smtpPort, username, password });

    await db.collection("mailAccountSecrets").doc(accountId).set({
      encrypted: encrypt(secretPayload, MAILBOX_ENC_KEY.value()),
      createdAt: new Date().toISOString(),
    });

    // Quick connectivity check so the user gets immediate feedback instead
    // of only discovering a bad password on the first "Sync now".
    let status = "CONNECTED";
    let lastError = null;
    try {
      const connection = await imaps.connect({
        imap: { user: username, password, host: imapHost, port: imapPort, tls: true, authTimeout: 8000 },
      });
      await connection.end();
    } catch (err) {
      status = "ERROR";
      lastError = err.message;
      logger.warn("Mailbox connectivity check failed", { accountId, error: err.message });
    }

    const profile = req.profile || await getProfile(req.user.uid);
    if (!profile || !profile.seat || profile.seat === "Unassigned") {
      await db.collection("mailAccountSecrets").doc(accountId).delete();
      return res.status(403).json({ error: "Admin/department-admin account must have an assigned seat before connecting a mailbox" });
    }

    await db.collection("mailAccounts").doc(accountId).set({
      id: accountId,
      branchOrSeat: branchOrSeat || profile.seat,
      branchOrSeatNormalized: normalizedBranch || String(profile.seat || "").trim().toLowerCase(),
      officeEmail,
      provider: "IMAP_SMTP",
      status,
      connectedBy: profile.name || req.user.email || req.user.uid,
      connectedByUid: req.user.uid,
      connectedAt: new Date().toISOString(),
      memberUids: [],
      ...(lastError ? { lastError } : {}),
    });

    res.json({ accountId, status, lastError });
  } catch (err) {
    logger.error("mailbox/connect failed", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
});

const mailboxJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many mailbox join/leave attempts, try again later." },
});

/**
 * POST /api/mailbox/:accountId/join
 *
 * Any signed-in officer with an assigned seat can join an already-connected
 * office mailbox to use its inbox/compose. Any number of officers may join
 * the SAME office mailbox (a branch can have many users). A single officer
 * may be joined to only ONE office mailbox at a time — join a different one
 * without leaving the current one first is rejected with 409.
 */
app.post("/api/mailbox/:accountId/join", mailboxJoinLimiter, async (req, res) => {
  try {
    const { accountId } = req.params;
    const accountRef = db.collection("mailAccounts").doc(accountId);
    const userRef = db.collection("users").doc(req.user.uid);

    // Runs the "already joined elsewhere?" check and the membership write
    // inside a single Firestore transaction, so two concurrent join
    // requests (double-click, two open tabs) can never both succeed and
    // leave one officer joined to two mailboxes at once — the second
    // request always sees the first one's write and gets a clean 409.
    const result = await db.runTransaction(async (tx) => {
      const [accountSnap, userSnap] = await Promise.all([tx.get(accountRef), tx.get(userRef)]);
      if (!accountSnap.exists) return { error: 404, message: "Mailbox not found" };

      const profile = userSnap.exists ? userSnap.data() : null;
      if (!profile || !profile.seat || profile.seat === "Unassigned") {
        return { error: 403, message: "Your account must have an assigned seat before joining an office mailbox" };
      }

      if (profile.connectedMailboxId && profile.connectedMailboxId !== accountId) {
        return { error: 409, message: "You are already connected to a different office mailbox. Leave it first before joining another.", connectedMailboxId: profile.connectedMailboxId };
      }

      tx.set(accountRef, { memberUids: admin.firestore.FieldValue.arrayUnion(req.user.uid) }, { merge: true });
      tx.set(userRef, { connectedMailboxId: accountId }, { merge: true });
      return { ok: true };
    });

    if (result.error) return res.status(result.error).json({ error: result.message, ...(result.connectedMailboxId ? { connectedMailboxId: result.connectedMailboxId } : {}) });

    await writeAudit(req, "MAILBOX_JOINED", "mailbox", accountId);
    res.json({ joined: true, accountId });
  } catch (err) {
    logger.error("mailbox/join failed", err);
    res.status(500).json({ error: err.message || "Join failed" });
  }
});

/**
 * POST /api/mailbox/:accountId/leave
 * Removes the caller from that mailbox's member list, freeing them up to
 * join a different office mailbox.
 */
app.post("/api/mailbox/:accountId/leave", mailboxJoinLimiter, async (req, res) => {
  try {
    const { accountId } = req.params;
    const accountRef = db.collection("mailAccounts").doc(accountId);
    const accountSnap = await accountRef.get();
    if (accountSnap.exists) {
      await accountRef.set({ memberUids: admin.firestore.FieldValue.arrayRemove(req.user.uid) }, { merge: true });
    }

    const profile = req.profile || await getProfile(req.user.uid);
    if (profile && profile.connectedMailboxId === accountId) {
      await db.collection("users").doc(req.user.uid).set({ connectedMailboxId: admin.firestore.FieldValue.delete() }, { merge: true });
    }

    await writeAudit(req, "MAILBOX_LEFT", "mailbox", accountId);
    res.json({ left: true });
  } catch (err) {
    logger.error("mailbox/leave failed", err);
    res.status(500).json({ error: err.message || "Leave failed" });
  }
});

/**
 * GET /api/mailbox/:accountId/inbox
 * Response: { messages: [{ id, from, subject, date, body, attachments }] }
 */
app.get("/api/mailbox/:accountId/inbox", distributedRateLimit({ collection: "apiRateLimitsMailbox", windowMs: 15 * 60 * 1000, limit: 30 }), requireMailboxAccess, async (req, res) => {
  try {
    const { accountId } = req.params;
    const secretDoc = await db.collection("mailAccountSecrets").doc(accountId).get();
    if (!secretDoc.exists) return res.status(404).json({ error: "Mailbox not found" });

    const creds = JSON.parse(decrypt(secretDoc.data().encrypted, MAILBOX_ENC_KEY.value()));

    const connection = await imaps.connect({
      imap: { user: creds.username, password: creds.password, host: creds.imapHost, port: creds.imapPort, tls: true, authTimeout: 10000 },
    });
    await connection.openBox("INBOX");

    // Last 20 messages, most recent first.
    const searchCriteria = ["ALL"];
    const fetchOptions = { bodies: [""], markSeen: false, struct: true };
    const results = await connection.search(searchCriteria, fetchOptions);
    const recent = results.slice(-20).reverse();

    const messages = await Promise.all(
      recent.map(async (res_, i) => {
        const raw = res_.parts.find((p) => p.which === "")?.body || "";
        const parsed = await simpleParser(raw);
        return {
          id: "MSG-" + accountId + "-" + (res_.attributes.uid || i),
          from: parsed.from?.text || "unknown",
          subject: parsed.subject || "(no subject)",
          date: (parsed.date || new Date()).toISOString().slice(0, 10),
          body: parsed.text || "",
          attachments: (parsed.attachments || []).map((a) => a.filename).filter(Boolean),
        };
      })
    );

    await connection.end();
    await writeAudit(req, "MAILBOX_INBOX_VIEWED", "mailbox", accountId);
    res.json({ messages });
  } catch (err) {
    logger.error("mailbox/inbox failed", err);
    // Mark the account as ERROR so the frontend can show that clearly.
    await db.collection("mailAccounts").doc(req.params.accountId).set({ status: "ERROR", lastError: err.message }, { merge: true }).catch(() => {});
    res.status(500).json({ error: err.message || "Inbox fetch failed" });
  }
});

/**
 * POST /api/mailbox/:accountId/send
 * Body: { to, subject, body }
 */
app.post("/api/mailbox/:accountId/send", distributedRateLimit({ collection: "apiRateLimitsMailbox", windowMs: 15 * 60 * 1000, limit: 20 }), requireMailboxAccess, validateBody(mailboxSendSchema), async (req, res) => {
  try {
    const { accountId } = req.params;
    const { to, subject, body } = req.body || {};
    if (!to || !subject) return res.status(400).json({ error: "to and subject are required" });

    const secretDoc = await db.collection("mailAccountSecrets").doc(accountId).get();
    if (!secretDoc.exists) return res.status(404).json({ error: "Mailbox not found" });
    const creds = JSON.parse(decrypt(secretDoc.data().encrypted, MAILBOX_ENC_KEY.value()));

    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpPort === 465,
      auth: { user: creds.username, pass: creds.password },
    });

    await transporter.sendMail({ from: creds.username, to, subject, text: body });
    await writeAudit(req, "MAIL_SENT", "mailbox", accountId, {
      metadata: { recipientDomain: String(to).split("@")[1] || "" }
    });
    res.json({ sent: true });
  } catch (err) {
    logger.error("mailbox/send failed", err);
    res.status(500).json({ error: err.message || "Send failed" });
  }
});

/**
 * POST /api/mailbox/:accountId/disconnect
 * Deletes the encrypted credentials AND the metadata doc entirely — not a
 * soft "inactive" flag — so this branch's office can connect a replacement
 * mailbox later. Also clears connectedMailboxId off every officer who had
 * joined it, so they're immediately free to join a different one.
 */
app.post("/api/mailbox/:accountId/disconnect", requireRole("DEPARTMENT_ADMIN", "ADMIN"), async (req, res) => {
  try {
    const { accountId } = req.params;

    const memberSnap = await db.collection("users").where("connectedMailboxId", "==", accountId).get();
    const batch = db.batch();
    memberSnap.docs.forEach((doc) => {
      batch.set(doc.ref, { connectedMailboxId: admin.firestore.FieldValue.delete() }, { merge: true });
    });
    if (!memberSnap.empty) await batch.commit();

    await db.collection("mailAccountSecrets").doc(accountId).delete();
    await db.collection("mailAccounts").doc(accountId).delete();
    await writeAudit(req, "MAILBOX_DISCONNECTED", "mailbox", accountId, { metadata: { membersCleared: memberSnap.size } });
    res.json({ disconnected: true });
  } catch (err) {
    logger.error("mailbox/disconnect failed", err);
    res.status(500).json({ error: err.message || "Disconnect failed" });
  }
});

// cors:true is intentionally NOT set here — CORS is handled entirely by the
// origin-restricted middleware above so ALLOWED_ORIGIN is actually enforced
// (the onRequest-level cors:true shortcut would allow every origin).
exports.api = onRequest({
  enforceAppCheck: true,
  secrets: [ANTHROPIC_API_KEY, MAILBOX_ENC_KEY, ...ROUTER_SECRETS],
}, app);

/**
 * Synchronize the Firestore profile role into a Firebase Auth custom claim.
 * The Firestore rules below only let admins change another user's role, so a
 * normal user cannot self-promote. Claim changes take effect after the user's
 * ID token refreshes.
 */
exports.syncUserRoleClaims = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;
  if (!after || !after.exists) return;

  const data = after.data() || {};
  const allowedRoles = ["USER", "DEPARTMENT_ADMIN", "ADMIN"];
  const role = allowedRoles.includes(data.role) ? data.role : "USER";

  const userRecord = await admin.auth().getUser(uid);
  const existingClaims = userRecord.customClaims || {};
  if (existingClaims.role === role) return;

  await admin.auth().setCustomUserClaims(uid, { ...existingClaims, role });
  logger.info("User role claim synchronized", { uid, role });
});

/**
 * Scheduled circular scraper — CS Haryana + Finance Department Haryana.
 *
 * It intentionally NEVER writes into the `rules` collection directly or sets
 * anything to VERIFIED — every scraped circular lands as status
 * "PENDING_REVIEW" so a human Admin must explicitly review + "Publish as
 * rule" from the UI (Section 26: AI/automation never unilaterally applies a
 * rule). This is a deliberate safety choice, not a limitation to work around.
 *
 * Parsing is intentionally generic (link-text + date-pattern heuristics)
 * rather than a per-site CSS-selector scraper, because government site
 * markup changes without notice and a brittle selector-based parser would
 * silently stop finding anything the day the source site is redesigned.
 * The trade-off: it may pick up a few irrelevant links alongside genuine
 * circulars/orders/notifications — acceptable because nothing here is ever
 * auto-published; a human Admin reviews and dismisses noise in the UI.
 * If the source sites expose an RSS/JSON feed, prefer wiring that in here
 * instead — it will be far more reliable than HTML scraping.
 */
const SOURCES = [
  { key: "CS_HARYANA", label: "CS Haryana", url: "https://csharyana.gov.in/circulars" },
  { key: "FINANCE_HARYANA", label: "Finance Department Haryana", url: "https://finhry.gov.in/circulars" },
];

// Extracted into lib/circularParser.js (no Firebase dependency) so this
// pure parsing/scoring logic can be unit tested directly — see
// test/circularParser.test.js.
const { significantWords, overlapRatio, parseCircularsFromHtml } = require("./lib/circularParser");

/**
 * Shared scrape-one-source logic — used by BOTH the 15-minute scheduled
 * job below AND the manual "Check now" button in the UI (POST
 * /api/circulars/scrape-now), so both paths always fetch and parse the
 * SAME real government page. Neither path ever fabricates/simulates data.
 * Returns { candidatesFound, written }.
 */
async function scrapeOneSource(source, verifiedRules) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let html;
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: { "User-Agent": "HaryanaRoadwaysPortal-CircularSync/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const candidates = parseCircularsFromHtml(html, source.url);
  let written = 0;

  for (const entry of candidates) {
    const hash = crypto.createHash("sha1").update(entry.url).digest("hex").slice(0, 16);
    const id = `${source.key}-${hash}`;
    const docRef = db.collection("circulars").doc(id);

    // Skip if we've already seen this URL (whether still pending, already
    // published, or dismissed) — never overwrite admin review.
    // eslint-disable-next-line no-await-in-loop
    const existing = await docRef.get();
    if (existing.exists) continue;

    const entryWords = significantWords(entry.title);
    let possibleConflictWith;
    for (const rule of verifiedRules) {
      if (overlapRatio(entryWords, rule.words) >= 0.5) {
        possibleConflictWith = rule.id;
        break;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await docRef.set({
      id,
      source: source.key,
      title: entry.title.slice(0, 300),
      summary: `Detected on ${source.label}'s circulars page. Open the source link to verify full content before publishing as a rule.`,
      sourceUrl: entry.url,
      fetchedAt: new Date().toISOString(),
      status: "PENDING_REVIEW",
      ...(possibleConflictWith ? { possibleConflictWith } : {}),
    });
    written += 1;
  }

  return { candidatesFound: candidates.length, written };
}

async function loadVerifiedRulesForConflictCheck() {
  try {
    const rulesSnap = await db.collection("rules").where("status", "==", "VERIFIED").limit(300).get();
    return rulesSnap.docs.map((d) => ({ id: d.id, words: significantWords(d.data().title) }));
  } catch (err) {
    logger.error("Could not load verified rules for conflict detection", err);
    return [];
  }
}

const scraperNowLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  message: { error: "Too many manual scrape requests — try again in a few minutes." },
});

/**
 * POST /api/circulars/scrape-now
 * Body: { sourceKey: "CS_HARYANA" | "FINANCE_HARYANA" }
 *
 * The "Check <Source> now" button in Rules Library calls this — it runs
 * the exact same real fetch+parse as the 15-minute scheduled job, just for
 * one source, on demand. This NEVER fabricates a fake/simulated circular;
 * if the real government page has nothing new, this returns 0 written.
 */
app.post("/api/circulars/scrape-now", scraperNowLimiter, requireRole("DEPARTMENT_ADMIN", "ADMIN"), async (req, res) => {
  try {
    const sourceKey = req.body?.sourceKey;
    const source = SOURCES.find((s) => s.key === sourceKey);
    if (!source) return res.status(400).json({ error: "Unknown sourceKey" });

    const verifiedRules = await loadVerifiedRulesForConflictCheck();
    const result = await scrapeOneSource(source, verifiedRules);
    await writeAudit(req, "SCRAPER_RUN_MANUAL", "circularSource", sourceKey, { metadata: result });

    res.json({ source: sourceKey, ...result });
  } catch (err) {
    logger.error(`Manual scrape failed for ${req.body?.sourceKey}`, err);
    res.status(502).json({ error: `Could not reach the source site right now: ${err.message}` });
  }
});

exports.scrapeCirculars = onSchedule("every 15 minutes", async () => {
  const verifiedRules = await loadVerifiedRulesForConflictCheck();

  for (const source of SOURCES) {
    try {
      const { candidatesFound, written } = await scrapeOneSource(source, verifiedRules);
      logger.info(`Circular sync for ${source.label}: ${candidatesFound} candidate link(s) found, ${written} new PENDING_REVIEW record(s) written.`);
    } catch (err) {
      logger.error(`Scrape failed for ${source.label}`, err);
    }
  }
});
