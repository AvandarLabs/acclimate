import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_THEME_PALETTE,
  SEMANTIC_THEME_ROLES,
} from "../theme.constants";
import { createTheme } from "./createTheme";

const DARK_ANSI_FG_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[3[0-7]m`);
const BRIGHT_ANSI_FG_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[9[0-7]m`,
);

describe("createTheme", () => {
  it("uses only high-contrast bright-half ANSI foreground codes across every default semantic role", () => {
    const theme = createTheme({ color: true });

    SEMANTIC_THEME_ROLES.forEach((role) => {
      const prefix = theme.palette[role];
      expect(prefix).toBe(DEFAULT_DARK_THEME_PALETTE[role]);
      expect(prefix).not.toMatch(DARK_ANSI_FG_PATTERN);
      expect(prefix).toMatch(BRIGHT_ANSI_FG_PATTERN);
      expect(theme[role]("sample")).toBe(`${prefix}sample\x1b[0m`);
      expect(theme.style(role, "sample")).toBe(`${prefix}sample\x1b[0m`);
    });

    expect(theme.selected("❯ json")).toBe("\x1b[1m\x1b[92m❯ json\x1b[0m");
    expect(theme.error("")).toBe("");
  });

  it("disables ANSI escapes when stream is redirected, NO_COLOR is non-empty, or TERM is dumb", () => {
    const redirected = createTheme({
      stream: { write: () => {}, isTTY: false },
      env: { TERM: "xterm-256color" },
    });
    const noColor = createTheme({
      isTTY: true,
      env: { NO_COLOR: "1", TERM: "xterm-256color" },
    });
    const dumbTerm = createTheme({
      isTTY: true,
      env: { TERM: "dumb" },
    });

    [redirected, noColor, dumbTerm].forEach((plainTheme) => {
      expect(plainTheme.isColorEnabled).toBe(false);
      expect(plainTheme.error("❌ Failed")).toBe("❌ Failed");
      expect(plainTheme.warning("⚠️ Try again")).toBe("⚠️ Try again");
      expect(plainTheme.selected("❯ coverage")).toBe("❯ coverage");
      expect(plainTheme.heading("Usage")).toBe("Usage");
    });
  });

  it("enables ANSI escapes when stream is a TTY and NO_COLOR is empty or unset", () => {
    const ttyTheme = createTheme({
      stream: { write: () => {}, isTTY: true },
      env: { NO_COLOR: "", TERM: "xterm-256color" },
    });

    expect(ttyTheme.isColorEnabled).toBe(true);
    expect(ttyTheme.accent("acclimate")).toBe("\x1b[96macclimate\x1b[0m");
  });

  it("applies custom token, token-array, and raw ANSI palette overrides and preserves them across withColor", () => {
    const customTheme = createTheme({
      color: true,
      palette: {
        accent: "bright_magenta",
        heading: ["bold", "bright_cyan"],
        info: "\x1b[38;5;117m",
      },
    });

    expect(customTheme.accent("cli")).toBe("\x1b[95mcli\x1b[0m");
    expect(customTheme.heading("Usage")).toBe("\x1b[1m\x1b[96mUsage\x1b[0m");
    expect(customTheme.info("Working")).toBe("\x1b[38;5;117mWorking\x1b[0m");
    expect(customTheme.error("Bad")).toBe("\x1b[91mBad\x1b[0m");

    const plainCopy = customTheme.withColor(false);
    expect(plainCopy.isColorEnabled).toBe(false);
    expect(plainCopy.accent("cli")).toBe("cli");
    expect(plainCopy.withColor(true).accent("cli")).toBe("\x1b[95mcli\x1b[0m");
  });
});
