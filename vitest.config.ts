import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
