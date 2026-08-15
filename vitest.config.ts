import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the frontend's own tests — functions/ is a separate npm
    // package with its own package.json and its own `npm test`, and
    // should be tested from inside functions/, not accidentally picked
    // up here by Vitest's default recursive globbing.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
