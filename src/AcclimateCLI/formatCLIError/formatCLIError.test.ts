import { describe, expect, it } from "vitest";
import { CLIError } from "@/CLIError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { formatCLIError } from "./formatCLIError";

describe("formatCLIError", () => {
  it("renders red error, indented yellow recovery hint, and usage text", () => {
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
        generateTerminalMessage(`|red|${error.message}|reset|`),
        generateTerminalMessage(
          "  |yellow|⚠️ Run avandar-lint coverage --help to see available options and usage.|reset|",
        ),
        "",
        "USAGE BLOCK",
      ].join("\n"),
    );
  });

  it("renders only the red error line when hint and usage are absent", () => {
    const error = CLIError.invalidPositionalArgConfig({
      cliName: "demo",
      positionalArgName: "paths",
    });

    expect(formatCLIError(error)).toBe(
      generateTerminalMessage(`|red|${error.message}|reset|`),
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
        generateTerminalMessage(`|red|${error.message}|reset|`),
        generateTerminalMessage(
          "  |yellow|⚠️ Run demo --help to see available options and usage.|reset|",
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
});
