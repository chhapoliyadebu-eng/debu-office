import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

/**
 * Firebase config comes from env vars (see .env.example).
 * Get these values from: Firebase Console → Project Settings → General → Your apps → Web app.
 *
 * Production builds are fail-closed when these values are missing; there is
 * no demo/mock authentication path in a production build.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredFirebaseKeys = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
];
export const firebaseConfigured = requiredFirebaseKeys.every(Boolean);
export const isProductionBuild = import.meta.env.VITE_APP_ENV === "production";

export const app = firebaseConfigured && getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = firebaseConfigured ? getFirestore(app) : null;
export const storage = firebaseConfigured ? getStorage(app) : null;
export const auth = firebaseConfigured ? getAuth(app) : null;

/**
 * Firebase App Check — bot/abuse protection. Verifies that requests to
 * Firestore and your Cloud Functions are coming from your actual deployed
 * app, not a script hitting your Firebase project's public API keys
 * directly (API keys are not secret — App Check is the real gate).
 *
 * OPT-IN: only activates if VITE_RECAPTCHA_SITE_KEY is set, so it never
 * breaks a deployment that hasn't set it up yet. See DEPLOY.md for the
 * 5-minute setup (Firebase Console → App Check → register a reCAPTCHA v3
 * site). Recommended before onboarding real officers beyond a test group.
 */
const recaptchaSiteKey = String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();
export const securityConfigured = Boolean(import.meta.env.VITE_API_BASE_URL && recaptchaSiteKey);
let appCheck: AppCheck | null = null;
if (firebaseConfigured && recaptchaSiteKey) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export async function getAuthenticatedApiHeaders(): Promise<Record<string, string>> {
  if (!auth?.currentUser) throw new Error("You must be signed in.");

  const idToken = await auth.currentUser.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };

  if (!appCheck) {
    throw new Error("Firebase App Check is not configured. Set VITE_RECAPTCHA_SITE_KEY for the deployed portal.");
  }

  const appCheckToken = await getToken(appCheck, false);
  headers["X-Firebase-AppCheck"] = appCheckToken.token;
  return headers;
}

/**
 * Login (Section 6). Two methods are wired:
 *   - Google Sign-In — works with ANY Google account, personal or
 *     official; not restricted to a government domain.
 *   - Email + Password — works with ANY email address.
 *
 * Login is intentionally NOT restricted to an official government email
 * domain — an officer can sign in with their own personal email. A
 * brand-new account starts as role "USER", department "Unassigned", and
 * can't do anything meaningful until a DEPARTMENT_ADMIN/ADMIN reviews and
 * approves it (see AdminPanel.tsx / PATCH /api/users/:uid) — that
 * approval step is the actual gate, not the email address used to sign
 * up. The office MAILBOX is a separate feature (MailboxSettings.tsx) and
 * is always a real government email address, entered directly by a
 * Department Admin/Admin when connecting it — that's where "official
 * email" actually matters here.
 */
export type { User };

export function signInWithGoogle() {
  if (!auth) throw new Error("Firebase not configured");
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signInWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase not configured");
  return signInWithEmailAndPassword(auth, email, password);
}

export function registerWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase not configured");
  return createUserWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email: string) {
  if (!auth) throw new Error("Firebase not configured");
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  if (!auth) return Promise.resolve();
  return firebaseSignOut(auth);
}

export function watchAuthState(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}


/** Upload a private file into a UID-scoped Storage path. Public ACLs are never used. */
export async function uploadPrivateFile(
  uid: string,
  file: File,
  kind: "files" | "signatures" | "ai-staging"
): Promise<{ path: string }> {
  if (!storage || !auth?.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("Authenticated storage session required.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const path = `${kind}/${uid}/${crypto.randomUUID()}-${safeName}`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, file, { contentType: file.type || "application/octet-stream" });
  return { path };
}
