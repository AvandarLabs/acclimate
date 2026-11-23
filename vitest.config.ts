import { fileURLToPath } from "url";
import { configDefaults, defineConfig } from "vitest/config";

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
    exclude: [
      ...configDefaults.exclude,
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".cursor/**",
      ".opencode/**",
    ],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
