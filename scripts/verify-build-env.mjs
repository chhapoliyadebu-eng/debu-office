const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_API_BASE_URL",
  "VITE_RECAPTCHA_SITE_KEY",
];

const missing = required.filter((key) => !String(process.env[key] || "").trim());
if (missing.length) {
  console.error("\nProduction build blocked. Missing environment variables:\n");
  for (const key of missing) console.error(`  - ${key}`);
  console.error("\nSet these in Netlify Site configuration → Environment variables.\n");
  process.exit(1);
}

const apiBase = process.env.VITE_API_BASE_URL.trim();
if (!/^https:\/\//i.test(apiBase) || /\/$/.test(apiBase)) {
  console.error("VITE_API_BASE_URL must be an HTTPS URL without a trailing slash.");
  process.exit(1);
}

if (process.env.VITE_APP_ENV && process.env.VITE_APP_ENV !== "production") {
  console.error("VITE_APP_ENV must be 'production' for a deployment build.");
  process.exit(1);
}

console.log("✓ Production environment configuration is present.");
