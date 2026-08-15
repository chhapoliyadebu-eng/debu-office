import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest searches parent directories for a config file if none is
    // found here — without this file it was picking up the frontend's
    // root vitest.config.ts (include: "src/**") and finding zero tests.
    // This file takes precedence since it's closer to functions/ itself.
    include: ["test/**/*.{test,spec}.{js,mjs}"],
  },
});
