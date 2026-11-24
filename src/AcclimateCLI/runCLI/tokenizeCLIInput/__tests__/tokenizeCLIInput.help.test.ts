import { describe, expect, it } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { generateHelpText } from "@/AcclimateCLI/generateHelpText/generateHelpText";
import { CLIError } from "@/CLIError";
import { tokenizeCLIInput } from "../tokenizeCLIInput";

function _expectCLIErrorCode(
  action: () => unknown,
  expectedCode: string,
): CLIError {
  let caughtError: unknown;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CLIError);
  if (!(caughtError instanceof CLIError)) {
    throw new Error("Expected CLIError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}

function _makeLintRootCLI() {
  const coverageCLI = createCLI("coverage")
    .description("Check coverage")
    .addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
    })
    .addOption({
      name: "--format",
      aliases: ["-f"] as const,
      type: "string",
      required: false,
      defaultValue: "stylish",
    });

  return createCLI("avandar-lint")
    .description("Lint workspace")
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
    })
    .addGlobalOption({
      name: "--config",
      aliases: ["-c"] as const,
      type: "string",
      required: false,
    })
    .addCommand("coverage", coverageCLI);
}

describe("tokenizeCLIInput - help and error context", () => {
  it("marks isHelpRequested true for root -h and --help with root commandPath", () => {
    const rootCLI = _makeLintRootCLI();

    const longResult = tokenizeCLIInput({ cli: rootCLI, input: ["--help"] });
    expect(longResult.isHelpRequested).toBe(true);
    expect(longResult.targetCLI.getName()).toBe("avandar-lint");
    expect(longResult.commandPath).toEqual(["avandar-lint"]);

    const shortResult = tokenizeCLIInput({ cli: rootCLI, input: ["-h"] });
    expect(shortResult.isHelpRequested).toBe(true);
    expect(shortResult.commandPath).toEqual(["avandar-lint"]);
  });

  it("marks isHelpRequested true for subcommand help and inherits parent global options", () => {
    const rootCLI = _makeLintRootCLI();

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["-v", "coverage", "-h"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.targetCLI.getName()).toBe("coverage");
    expect(result.commandPath).toEqual(["avandar-lint", "coverage"]);
    const subcommandHelp = generateHelpText(result.targetCLI, {
      commandPath: result.commandPath,
    });
    expect(subcommandHelp).toContain("--verbose, -v");
    expect(subcommandHelp).toContain("--config, -c");
  });

  it("tracks full commandPath through deeply nested subcommands", () => {
    const newCLI = createCLI("new");
    const modelsCLI = createCLI("internal-models").addCommand("new", newCLI);
    const devCLI = createCLI("dev").addCommand("models", modelsCLI);
    const rootCLI = createCLI("root").addCommand("dev", devCLI);

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["dev", "models", "new", "--help"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.commandPath).toEqual(["root", "dev", "models", "new"]);
  });

  it("gives --help precedence over unknown flags before or after it and over missing option values", () => {
    const rootCLI = _makeLintRootCLI();

    const afterUnknown = tokenizeCLIInput({
      cli: rootCLI,
      input: ["coverage", "--bogus", "--help"],
    });
    expect(afterUnknown.isHelpRequested).toBe(true);
    expect(afterUnknown.commandPath).toEqual(["avandar-lint", "coverage"]);

    const beforeUnknown = tokenizeCLIInput({
      cli: rootCLI,
      input: ["coverage", "--help", "--bogus"],
    });
    expect(beforeUnknown.isHelpRequested).toBe(true);
    expect(beforeUnknown.commandPath).toEqual(["avandar-lint", "coverage"]);

    const afterPendingOption = tokenizeCLIInput({
      cli: rootCLI,
      input: ["coverage", "--format", "--help"],
    });
    expect(afterPendingOption.isHelpRequested).toBe(true);
    expect(afterPendingOption.commandPath).toEqual([
      "avandar-lint",
      "coverage",
    ]);
  });

  it("targets root help when --help appears before a subcommand name", () => {
    const rootCLI = _makeLintRootCLI();

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["--help", "coverage"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.commandPath).toEqual(["avandar-lint"]);
    expect(result.targetCLI.getName()).toBe("avandar-lint");
  });

  it("passes -h and --help as literal positional arguments after --", () => {
    const rootCLI = _makeLintRootCLI();

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["coverage", "--", "-h", "--help"],
    });

    expect(result.isHelpRequested).toBe(false);
    expect(result.rawPositionalArgs).toEqual(["-h", "--help"]);
  });

  it("treats --format=--help as an inline option value rather than built-in help", () => {
    const rootCLI = _makeLintRootCLI();

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["coverage", "--format=--help"],
    });

    expect(result.isHelpRequested).toBe(false);
    expect(result.rawOptionArgs).toEqual({ "--format": "--help" });
  });

  it("respects user-registered -h alias while keeping --help built-in", () => {
    const cli = createCLI("connect").addOption({
      name: "--host",
      aliases: ["-h"] as const,
      type: "string",
      required: false,
    });

    const hostResult = tokenizeCLIInput({
      cli,
      input: ["-h", "localhost"],
    });
    expect(hostResult.isHelpRequested).toBe(false);
    expect(hostResult.rawOptionArgs).toEqual({ "--host": "localhost" });

    const helpResult = tokenizeCLIInput({ cli, input: ["--help"] });
    expect(helpResult.isHelpRequested).toBe(true);
  });

  it("defers to user-registered --help option instead of built-in help", () => {
    const cli = createCLI("custom").addOption({
      name: "--help",
      type: "boolean",
      required: false,
    });

    const result = tokenizeCLIInput({ cli, input: ["--help"] });
    expect(result.isHelpRequested).toBe(false);
    expect(result.rawOptionArgs).toEqual({ "--help": "" });
  });

  it("attaches commandPath, hint, and usage with inherited globals to subcommand unknown_option errors", () => {
    const rootCLI = _makeLintRootCLI();

    const error = _expectCLIErrorCode(() => {
      tokenizeCLIInput({ cli: rootCLI, input: ["coverage", "--bogus"] });
    }, "unknown_option");

    expect(error.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(error.hint).toBe(
      "Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(error.usage).toContain("avandar-lint coverage");
    expect(error.usage).toContain("--verbose, -v");
  });

  it("rejects an unknown flag before a subcommand on root without descending", () => {
    const rootCLI = _makeLintRootCLI();

    const error = _expectCLIErrorCode(() => {
      tokenizeCLIInput({ cli: rootCLI, input: ["--bogus", "coverage"] });
    }, "unknown_option");

    expect(error.commandPath).toEqual(["avandar-lint"]);
    expect(error.hint).toBe(
      "Run avandar-lint --help to see available options and usage.",
    );
  });
});
