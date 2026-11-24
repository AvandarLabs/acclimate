import { describe, expect, it } from "vitest";
import { stripAnsi } from "./stripAnsi";

describe("stripAnsi", () => {
  it("removes ANSI SGR color and CSI control escapes while preserving text and emoji", () => {
    const styled =
      "\x1b[?25l\x1b[1m\x1b[92m❯ coverage\x1b[0m - \x1b[90m✅ ready\x1b[0m\x1b[?25h";

    expect(stripAnsi(styled)).toBe("❯ coverage - ✅ ready");
  });

  it("returns plain text unchanged when no ANSI sequences are present", () => {
    expect(stripAnsi("❌ Error: missing --format\n  ⚠️ Run tool --help")).toBe(
      "❌ Error: missing --format\n  ⚠️ Run tool --help",
    );
  });
});
