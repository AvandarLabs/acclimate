import { describe, expect, it } from "vitest";
import { createCli } from "@/AcclimateCli/createCli";
import { generateHelpText } from "@/AcclimateCli/generateHelpText/generateHelpText";
import { CliError } from "@/CliError";
import { tokenizeCliInput } from "../tokenizeCliInput";

function _expectCliErrorCode(
  action: () => unknown,
  expectedCode: string,
): CliError {
  let caughtError: unknown;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CliError);
  if (!(caughtError instanceof CliError)) {
    throw new Error("Expected CliError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}

function _makeLintRootCli() {
  const coverageCli = createCli("coverage")
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

  return createCli("avandar-lint")
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
    .addCommand("coverage", coverageCli);
}

describe("tokenizeCliInput - help and error context", () => {
  it("marks isHelpRequested true for root -h and --help with root commandPath", () => {
    const rootCli = _makeLintRootCli();

    const longResult = tokenizeCliInput({ cli: rootCli, input: ["--help"] });
    expect(longResult.isHelpRequested).toBe(true);
    expect(longResult.targetCli.getName()).toBe("avandar-lint");
    expect(longResult.commandPath).toEqual(["avandar-lint"]);

    const shortResult = tokenizeCliInput({ cli: rootCli, input: ["-h"] });
    expect(shortResult.isHelpRequested).toBe(true);
    expect(shortResult.commandPath).toEqual(["avandar-lint"]);
  });

  it("marks isHelpRequested true for subcommand help and inherits parent global options", () => {
    const rootCli = _makeLintRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["-v", "coverage", "-h"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.targetCli.getName()).toBe("coverage");
    expect(result.commandPath).toEqual(["avandar-lint", "coverage"]);
    const subcommandHelp = generateHelpText(result.targetCli, {
      commandPath: result.commandPath,
    });
    expect(subcommandHelp).toContain("--verbose, -v");
    expect(subcommandHelp).toContain("--config, -c");
  });

  it("tracks full commandPath through deeply nested subcommands", () => {
    const newCli = createCli("new");
    const modelsCli = createCli("internal-models").addCommand("new", newCli);
    const devCli = createCli("dev").addCommand("models", modelsCli);
    const rootCli = createCli("root").addCommand("dev", devCli);

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["dev", "models", "new", "--help"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.commandPath).toEqual(["root", "dev", "models", "new"]);
  });

  it("gives --help precedence over unknown flags before or after it and over missing option values", () => {
    const rootCli = _makeLintRootCli();

    const afterUnknown = tokenizeCliInput({
      cli: rootCli,
      input: ["coverage", "--bogus", "--help"],
    });
    expect(afterUnknown.isHelpRequested).toBe(true);
    expect(afterUnknown.commandPath).toEqual(["avandar-lint", "coverage"]);

    const beforeUnknown = tokenizeCliInput({
      cli: rootCli,
      input: ["coverage", "--help", "--bogus"],
    });
    expect(beforeUnknown.isHelpRequested).toBe(true);
    expect(beforeUnknown.commandPath).toEqual(["avandar-lint", "coverage"]);

    const afterPendingOption = tokenizeCliInput({
      cli: rootCli,
      input: ["coverage", "--format", "--help"],
    });
    expect(afterPendingOption.isHelpRequested).toBe(true);
    expect(afterPendingOption.commandPath).toEqual([
      "avandar-lint",
      "coverage",
    ]);
  });

  it("targets root help when --help appears before a subcommand name", () => {
    const rootCli = _makeLintRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["--help", "coverage"],
    });

    expect(result.isHelpRequested).toBe(true);
    expect(result.commandPath).toEqual(["avandar-lint"]);
    expect(result.targetCli.getName()).toBe("avandar-lint");
  });

  it("passes -h and --help as literal positional arguments after --", () => {
    const rootCli = _makeLintRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["coverage", "--", "-h", "--help"],
    });

    expect(result.isHelpRequested).toBe(false);
    expect(result.rawPositionalArgs).toEqual(["-h", "--help"]);
  });

  it("treats --format=--help as an inline option value rather than built-in help", () => {
    const rootCli = _makeLintRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["coverage", "--format=--help"],
    });

    expect(result.isHelpRequested).toBe(false);
    expect(result.rawOptionArgs).toEqual({ "--format": "--help" });
  });

  it("respects user-registered -h alias while keeping --help built-in", () => {
    const cli = createCli("connect").addOption({
      name: "--host",
      aliases: ["-h"] as const,
      type: "string",
      required: false,
    });

    const hostResult = tokenizeCliInput({
      cli,
      input: ["-h", "localhost"],
    });
    expect(hostResult.isHelpRequested).toBe(false);
    expect(hostResult.rawOptionArgs).toEqual({ "--host": "localhost" });

    const helpResult = tokenizeCliInput({ cli, input: ["--help"] });
    expect(helpResult.isHelpRequested).toBe(true);
  });

  it("defers to user-registered --help option instead of built-in help", () => {
    const cli = createCli("custom").addOption({
      name: "--help",
      type: "boolean",
      required: false,
    });

    const result = tokenizeCliInput({ cli, input: ["--help"] });
    expect(result.isHelpRequested).toBe(false);
    expect(result.rawOptionArgs).toEqual({ "--help": "" });
  });

  it("attaches commandPath, hint, and usage with inherited globals to subcommand unknown_option errors", () => {
    const rootCli = _makeLintRootCli();

    const error = _expectCliErrorCode(() => {
      tokenizeCliInput({ cli: rootCli, input: ["coverage", "--bogus"] });
    }, "unknown_option");

    expect(error.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(error.hint).toBe(
      "Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(error.usage).toContain("avandar-lint coverage");
    expect(error.usage).toContain("--verbose, -v");
  });

  it("rejects an unknown flag before a subcommand on root without descending", () => {
    const rootCli = _makeLintRootCli();

    const error = _expectCliErrorCode(() => {
      tokenizeCliInput({ cli: rootCli, input: ["--bogus", "coverage"] });
    }, "unknown_option");

    expect(error.commandPath).toEqual(["avandar-lint"]);
    expect(error.hint).toBe(
      "Run avandar-lint --help to see available options and usage.",
    );
  });
});
