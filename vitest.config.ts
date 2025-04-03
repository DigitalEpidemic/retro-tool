// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    coverage: {
      provider: "v8",
      exclude: [
        // Config files
        "**/*.config.js",
        "**/*.config.ts",
        "**/postcss.config.js",
        "**/tailwind.config.js",
        "**/vite.config.ts",
        "**/eslint.config.js",
        // Setup files
        "**/setupTests.ts",
        // Other files to exclude
        "**/node_modules/**",
        "**/.eslintrc.js",
        "**/dist/**",
        "**/public/**",
        "**/src/test/setup.ts",
        "**/src/vite-env.d.ts",
      ],
    },
  },
});
