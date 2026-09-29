import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/replay/**/*.test.ts",
      "tests/retrieval/**/*.test.ts",
      "web/tests/unit/**/*.test.ts",
      "web/tests/unit/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@core": path.resolve(rootDir, "packages/core/src"),
      "@": path.resolve(rootDir, "web"),
      // Server-only modules (web/lib/server/*) are plain code under test.
      "server-only": path.resolve(rootDir, "tests/stubs/server-only.ts"),
    },
    // Same guard as week 5 (BUILD-NOTES-NEXTJS.md Task 6): a stray
    // web/pnpm-lock.yaml would give web/ its own disconnected node_modules
    // store and a second copy of React.
    dedupe: ["react", "react-dom"],
  },
});
