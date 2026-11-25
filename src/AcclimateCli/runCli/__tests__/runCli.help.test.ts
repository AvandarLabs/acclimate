import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import { createTheme } from "@/theme/createTheme/createTheme";
import type { ActionArgs } from "./runCli.testHelpers";

const readlineMocks = vi.hoisted(() => {
  const question = vi.fn<() => Promise<string>>();
  const close = vi.fn();
  const createInterface = vi.fn(() => {
    return { question, close };
  });

  return { question, close, createInterface };
});

vi.mock("node:readline/promises", () => {
  return {
    createInterface: readlineMocks.createInterface,
  };
});

function _createMemoryStream() {
  const chunks: string[] = [];
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
    },
    getOutput: () => {
      return chunks.join("");
    },
  };
}

function _makeCoverageSubcommand(coverageAction: (args: ActionArgs) => void) {
  return createCli("coverage")
    .description("Check test coverage for target paths")
    .addPositionalArg({
      name: "target",
      type: "string",
      required: true,
      askIfEmpty: true,
      description: "Primary target",
    })
    .addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
      defaultValue: ["."],
      description: "Additional paths",
    })
    .addOption({
      name: "--format",
      aliases: ["-f"] as const,
      type: "string",
      required: true,
      askIfEmpty: true,
      choices: ["stylish", "agent", "json"] as const,
      description: "Output format",
    })
    .addExample({
      command: "avandar-lint coverage web src/a.ts --format json",
      description: "Check web target with JSON output",
    })
    .action(coverageAction);
}

function _makeLintCli(options: {
  rootAction: (args: ActionArgs) => void;
  coverageAction: (args: ActionArgs) => void;
}) {
  return createCli("avandar-lint")
    .description("Workspace linting CLI")
    .addPositionalArg({
      name: "workspace",
      type: "string",
      required: true,
      askIfEmpty: true,
      description: "Workspace name",
    })
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Verbose logging",
    })
    .addCommand("coverage", _makeCoverageSubcommand(options.coverageAction))
    .action(options.rootAction);
}

beforeEach(() => {
  readlineMocks.question.mockReset();
  readlineMocks.close.mockReset();
  readlineMocks.createInterface.mockReset();
  readlineMocks.createInterface.mockReturnValue({
    question: readlineMocks.question,
    close: readlineMocks.close,
  });
});

describe("runCli - built-in help", () => {
  it("writes root help to stdout for --help and -h without running actions, validation, or prompts", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const coverageAction = vi.fn<(args: ActionArgs) => void>();
    const cli = _makeLintCli({ rootAction, coverageAction });

    for (const flag of ["--help", "-h"]) {
      const stdout = _createMemoryStream();
      await runCli({ cli, input: [flag], stdout });

      const output = stdout.getOutput();
      expect(output).toContain("avandar-lint");
      expect(output).toContain("Workspace linting CLI");
      expect(output).toContain("avandar-lint [command] <workspace> [options]");
      expect(output).toContain("--help, -h");
      expect(output).toContain("coverage");
    }

    expect(rootAction).not.toHaveBeenCalled();
    expect(coverageAction).not.toHaveBeenCalled();
    expect(readlineMocks.createInterface).not.toHaveBeenCalled();
  });

  it("writes subcommand help with inherited globals, variadic args, choices, and examples with zero side effects", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const coverageAction = vi.fn<(args: ActionArgs) => void>();
    const cli = _makeLintCli({ rootAction, coverageAction });
    const stdout = _createMemoryStream();

    await runCli({ cli, input: ["-v", "coverage", "-h"], stdout });

    const output = stdout.getOutput();
    expect(output).toContain("avandar-lint coverage");
    expect(output).toContain(
      "avandar-lint coverage <target> [paths...] [options]",
    );
    expect(output).toContain("paths...");
    expect(output).toContain("string[]");
    expect(output).toContain("[choices: stylish | agent | json]");
    expect(output).toContain("--verbose, -v");
    expect(output).toContain("Check web target with JSON output");
    expect(rootAction).not.toHaveBeenCalled();
    expect(coverageAction).not.toHaveBeenCalled();
    expect(readlineMocks.createInterface).not.toHaveBeenCalled();
  });

  it("passes --help and -h as positional arguments after -- instead of printing help", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const stdout = _createMemoryStream();
    const cli = createCli("echo")
      .addPositionalArg({
        name: "items",
        type: "string",
        required: true,
        variadic: true,
      })
      .action(action);

    await runCli({ cli, input: ["--", "--help", "-h"], stdout });

    expect(stdout.getOutput()).toBe("");
    expect(action).toHaveBeenCalledWith({ items: ["--help", "-h"] });
  });

  it("writes subcommand help with full commandPath when an actionless subcommand runs bare", async () => {
    const stdout = _createMemoryStream();
    const dbCli = createCli("db").description("Database utilities");
    const devCli = createCli("dev")
      .description("Dev tools")
      .addCommand("db", dbCli);
    const rootCli = createCli("acme").addCommand("dev", devCli);

    await runCli({ cli: rootCli, input: ["dev"], stdout });

    const output = stdout.getOutput();
    expect(output).toContain("acme dev");
    expect(output).toContain("acme dev <command> [options]");
    expect(output).toContain("Database utilities");
  });

  it("awaits async command actions before resolving", async () => {
    let didComplete = false;
    const cli = createCli("async-demo").action(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      didComplete = true;
    });

    await runCli({ cli, input: [] });

    expect(didComplete).toBe(true);
  });

  it("omits ANSI escapes from help output on redirected stdout, NO_COLOR, or TERM=dumb and applies custom themes on TTY stdout", async () => {
    const cli = createCli("demo").description("Demo tool");
    const customTheme = createTheme({
      color: true,
      palette: { accent: "bright_magenta", heading: "bright_blue" },
    });

    const redirectedStdout = _createMemoryStream();
    await runCli({
      cli,
      input: ["--help"],
      stdout: redirectedStdout,
      env: {},
      theme: customTheme,
    });
    expect(redirectedStdout.getOutput()).not.toContain("\x1b[");
    expect(redirectedStdout.getOutput()).toContain("demo");

    const noColorStdout = _createMemoryStream();
    await runCli({
      cli,
      input: ["--help"],
      stdout: noColorStdout,
      isStdoutTTY: true,
      env: { NO_COLOR: "1" },
      theme: customTheme,
    });
    expect(noColorStdout.getOutput()).not.toContain("\x1b[");

    const dumbStdout = _createMemoryStream();
    await runCli({
      cli,
      input: ["--help"],
      stdout: dumbStdout,
      isStdoutTTY: true,
      env: { TERM: "dumb" },
      theme: customTheme,
    });
    expect(dumbStdout.getOutput()).not.toContain("\x1b[");

    const ttyStdout = _createMemoryStream();
    await runCli({
      cli,
      input: ["--help"],
      stdout: ttyStdout,
      isStdoutTTY: true,
      env: { TERM: "xterm-256color" },
      theme: customTheme,
    });
    expect(ttyStdout.getOutput()).toContain("\x1b[95mdemo\x1b[0m");
    expect(ttyStdout.getOutput()).toContain("\x1b[94mUsage\x1b[0m");
  });
});
