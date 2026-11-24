import { describe, expect, it } from "vitest";
import { CLIError } from "@/CLIError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { createTheme } from "@/theme/createTheme/createTheme";
import { formatCLIError } from "./formatCLIError";

describe("formatCLIError", () => {
  it("renders bright-red error, indented bright-yellow recovery hint, and usage text", () => {
    const error = CLIError.unknownOption({
      cliName: "avandar-lint coverage",
      optionName: "--bogus",
    }).withHelpContext({
      commandPath: ["avandar-lint", "coverage"],
      hint: "Run avandar-lint coverage --help to see available options and usage.",
      usage: "USAGE BLOCK",
    });

    expect(formatCLIError(error)).toBe(
      [
        generateTerminalMessage(`|bright_red|${error.message}|reset|`),
        generateTerminalMessage(
          "  |bright_yellow|⚠️ Run avandar-lint coverage --help to see available options and usage.|reset|",
        ),
        "",
        "USAGE BLOCK",
      ].join("\n"),
    );
  });

  it("renders only the bright-red error line when hint and usage are absent", () => {
    const error = CLIError.invalidPositionalArgConfig({
      cliName: "demo",
      positionalArgName: "paths",
    });

    expect(formatCLIError(error)).toBe(
      generateTerminalMessage(`|bright_red|${error.message}|reset|`),
    );
  });

  it("renders the recovery hint without trailing blank lines when usage is absent", () => {
    const error = new CLIError({
      cliName: "demo",
      message: 'Unknown option "--bad"',
      code: "unknown_option",
      details: { optionName: "--bad" },
      hint: "Run demo --help to see available options and usage.",
    });

    expect(formatCLIError(error)).toBe(
      [
        generateTerminalMessage(`|bright_red|${error.message}|reset|`),
        generateTerminalMessage(
          "  |bright_yellow|⚠️ Run demo --help to see available options and usage.|reset|",
        ),
      ].join("\n"),
    );
  });

  it("renders plain text without ANSI escapes when color is false", () => {
    const error = CLIError.unknownOption({
      cliName: "demo",
      optionName: "--bad",
    }).withHelpContext({
      commandPath: ["demo"],
      hint: "Run demo --help to see available options and usage.",
      usage: "USAGE BLOCK",
    });

    const formatted = formatCLIError(error, { color: false });

    expect(formatted).toBe(
      [
        '❌ Error running demo: Unknown option "--bad"',
        "  ⚠️ Run demo --help to see available options and usage.",
        "",
        "USAGE BLOCK",
      ].join("\n"),
    );
    expect(formatted).not.toContain("\x1b[");
  });

  it("strips pre-styled ANSI escapes from attached usage when plain mode is active via NO_COLOR or TERM=dumb", () => {
    const error = CLIError.unknownOption({
      cliName: "demo",
      optionName: "--bad",
    }).withHelpContext({
      commandPath: ["demo"],
      hint: "Run demo --help to see available options and usage.",
      usage: "\x1b[96mdemo\x1b[0m\n\n\x1b[93mUsage\x1b[0m\n  demo [options]",
    });

    const noColorOutput = formatCLIError(error, {
      isTTY: true,
      env: { NO_COLOR: "1" },
    });
    expect(noColorOutput).not.toContain("\x1b[");
    expect(noColorOutput).toContain(
      '❌ Error running demo: Unknown option "--bad"',
    );
    expect(noColorOutput).toContain(
      "  ⚠️ Run demo --help to see available options and usage.",
    );
    expect(noColorOutput).toContain("demo [options]");

    const dumbOutput = formatCLIError(error, {
      isTTY: true,
      env: { TERM: "dumb" },
    });
    expect(dumbOutput).toBe(noColorOutput);
  });

  it("applies a custom semantic theme to error and warning lines", () => {
    const error = CLIError.unknownOption({
      cliName: "demo",
      optionName: "--bad",
    }).withHelpContext({
      commandPath: ["demo"],
      hint: "Run demo --help.",
    });
    const customTheme = createTheme({
      color: true,
      palette: { error: "bright_magenta", warning: "bright_cyan" },
    });

    const formatted = formatCLIError(error, { theme: customTheme });
    expect(formatted).toContain(`\x1b[95m${error.message}\x1b[0m`);
    expect(formatted).toContain("  \x1b[96m⚠️ Run demo --help.\x1b[0m");
  });
});
