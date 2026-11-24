import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { createTheme } from "@/theme/createTheme/createTheme";
import { executeCLI } from "../executeCLI";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

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

function _makeCoverageCLI(onAction: () => void) {
  const coverageCLI = createCLI("coverage")
    .description("Check test coverage for target paths")
    .addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
      description: "Paths to inspect",
    })
    .addOption({
      name: "--format",
      aliases: ["-f"] as const,
      type: "string",
      required: false,
      choices: ["stylish", "agent", "json"] as const,
      defaultValue: "stylish",
      description: "Output format",
    })
    .addExample({
      command: "avandar-lint coverage --format json src/",
      description: "Emit JSON coverage summary",
    })
    .action(onAction);

  return createCLI("avandar-lint")
    .description("Workspace linting tool")
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Verbose logging",
    })
    .addCommand("coverage", coverageCLI);
}

describe("executeCLI - unit boundary", () => {
  it("writes help to stdout, leaves stderr empty, and returns exit code 0 for --help and -h", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);

    for (const input of [["--help"], ["coverage", "-h"]]) {
      const stdout = _createMemoryStream();
      const stderr = _createMemoryStream();

      const exitCode = await executeCLI({
        cli,
        input,
        stdout,
        stderr,
        onExitCode,
      });

      expect(exitCode).toBe(0);
      expect(stdout.getOutput()).toContain("avandar-lint");
      expect(stderr.getOutput()).toBe("");
    }

    expect(action).not.toHaveBeenCalled();
    expect(onExitCode).not.toHaveBeenCalled();
  });

  it("writes error, recovery hint, and usage to stderr and returns exit code 1 on unknown flag", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: ["coverage", "--bogus"],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(1);
    expect(onExitCode).toHaveBeenCalledWith(1);
    expect(action).not.toHaveBeenCalled();
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain(
      '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
    );
    expect(stderr.getOutput()).toContain(
      "⚠️ Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(stderr.getOutput()).toContain(
      "avandar-lint coverage [paths...] [options]",
    );
    expect(stderr.getOutput()).toContain("--verbose, -v");
    expect(stderr.getOutput()).not.toContain("at tokenizeCLIInput");
  });

  it("returns 0 without invoking onExitCode when an action completes normally", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: ["coverage", "src/a.ts"],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(0);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onExitCode).not.toHaveBeenCalled();
    expect(stderr.getOutput()).toBe("");
  });

  it("writes unexpected non-CLIError failures to stderr and returns exit code 1", async () => {
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = createCLI("boom").action(() => {
      throw new Error("unexpected runtime failure");
    });
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: [],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(1);
    expect(onExitCode).toHaveBeenCalledWith(1);
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain("unexpected runtime failure");
  });

  it("returns exit code 130 with concise cancellation stderr and empty stdout on Ctrl-C in a menu", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();
    const ttyInput = Object.assign(new PassThrough(), {
      isTTY: true,
      isRaw: false,
      setRawMode: (mode: boolean) => {
        ttyInput.isRaw = mode;
      },
    });
    const ttyOutput = _createMemoryStream();
    const terminal: TerminalSession = {
      input: ttyInput,
      output: Object.assign(ttyOutput, { isTTY: true }),
      isColorEnabled: true,
      isRawModeSupported: true,
      close: () => {
        return Promise.resolve();
      },
    };

    const cli = createCLI("deploy")
      .addOption({
        name: "--env",
        type: "string",
        required: true,
        choices: ["dev", "prod"] as const,
        askIfEmpty: true,
      })
      .action(action);

    const exitPromise = executeCLI({
      cli,
      input: [],
      stdout,
      stderr,
      terminal,
      onExitCode,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    ttyInput.write("\x03");

    const exitCode = await exitPromise;
    expect(exitCode).toBe(130);
    expect(onExitCode).toHaveBeenCalledWith(130);
    expect(action).not.toHaveBeenCalled();
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain("Cancelled");
    expect(stderr.getOutput()).not.toContain("Usage");
    expect(ttyInput.isRaw).toBe(false);
  });

  it("honors --no-prompt even when an interactive terminal session is supplied", async () => {
    const action = vi.fn<() => void>();
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();
    const terminal: TerminalSession = {
      input: Object.assign(new PassThrough(), { isTTY: true }),
      output: Object.assign(_createMemoryStream(), { isTTY: true }),
      isColorEnabled: true,
      isRawModeSupported: true,
      close: () => {
        return Promise.resolve();
      },
    };
    const cli = createCLI("deploy")
      .addOption({
        name: "--env",
        type: "string",
        required: true,
        choices: ["dev", "prod"] as const,
        askIfEmpty: true,
      })
      .action(action);

    const exitCode = await executeCLI({
      cli,
      input: ["--no-prompt"],
      stdout,
      stderr,
      terminal,
    });

    expect(exitCode).toBe(1);
    expect(action).not.toHaveBeenCalled();
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain("--env");
    expect(stderr.getOutput()).toContain("deploy --env");
  });

  it("emits zero ANSI escapes in error and attached usage when stderr is redirected, NO_COLOR is set, or TERM is dumb, and styles TTY stderr via theme", async () => {
    const cli = _makeCoverageCLI(() => {});
    const customTheme = createTheme({
      color: true,
      palette: { error: "bright_magenta", warning: "bright_cyan" },
    });

    const redirectedStderr = _createMemoryStream();
    const redirectedCode = await executeCLI({
      cli,
      args: ["coverage", "--bogus"],
      stdout: _createMemoryStream(),
      stderr: redirectedStderr,
      env: {},
      theme: customTheme,
    });
    expect(redirectedCode).toBe(1);
    expect(redirectedStderr.getOutput()).not.toContain("\x1b[");
    expect(redirectedStderr.getOutput()).toContain(
      "⚠️ Run avandar-lint coverage --help",
    );
    expect(redirectedStderr.getOutput()).toContain("Usage");

    const noColorStderr = _createMemoryStream();
    await executeCLI({
      cli,
      args: ["coverage", "--bogus"],
      stdout: _createMemoryStream(),
      stderr: noColorStderr,
      isStderrTTY: true,
      env: { NO_COLOR: "1" },
      theme: customTheme,
    });
    expect(noColorStderr.getOutput()).not.toContain("\x1b[");

    const dumbStderr = _createMemoryStream();
    await executeCLI({
      cli,
      args: ["coverage", "--bogus"],
      stdout: _createMemoryStream(),
      stderr: dumbStderr,
      isStderrTTY: true,
      env: { TERM: "dumb" },
      theme: customTheme,
    });
    expect(dumbStderr.getOutput()).not.toContain("\x1b[");

    const ttyStderr = _createMemoryStream();
    await executeCLI({
      cli,
      args: ["coverage", "--bogus"],
      stdout: _createMemoryStream(),
      stderr: ttyStderr,
      isStderrTTY: true,
      env: { TERM: "xterm-256color" },
      theme: customTheme,
    });
    expect(ttyStderr.getOutput()).toContain("\x1b[95m❌ Error running");
    expect(ttyStderr.getOutput()).toContain("  \x1b[96m⚠️ Run avandar-lint");
  });

  it("returns exit code 0 and writes JSON to stdout when selecting a choice via injected promptIo", async () => {
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();
    const promptInput = Object.assign(new PassThrough(), {
      isTTY: true,
      isRaw: false,
      setRawMode: (mode: boolean) => {
        promptInput.isRaw = mode;
      },
    });
    const promptOutput = Object.assign(_createMemoryStream(), { isTTY: true });
    const cli = createCLI("deploy")
      .addOption({
        name: "--env",
        type: "string",
        required: true,
        choices: ["dev", "prod"] as const,
        askIfEmpty: true,
      })
      .action(({ env }) => {
        stdout.write(`${JSON.stringify({ env })}\n`);
      });

    const exitPromise = executeCLI({
      cli,
      args: [],
      stdout,
      stderr,
      promptIo: { input: promptInput, output: promptOutput },
      env: { TERM: "xterm-256color" },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    promptInput.write("j");
    promptInput.write("\r");

    expect(await exitPromise).toBe(0);
    expect(JSON.parse(stdout.getOutput())).toEqual({ env: "prod" });
    expect(stderr.getOutput()).toBe("");
    expect(promptOutput.getOutput()).toContain("\x1b[1m\x1b[92m❯ prod\x1b[0m");
  });
});
