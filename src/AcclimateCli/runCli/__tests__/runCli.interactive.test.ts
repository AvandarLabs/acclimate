import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import { expectRejectedCliErrorCode } from "./runCli.testHelpers";
import type { ActionArgs } from "./runCli.testHelpers";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _createMemoryStream(isTty: boolean = false) {
  const chunks: string[] = [];
  return {
    isTTY: isTty,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    getOutput: () => {
      return chunks.join("");
    },
  };
}

function _createInteractiveTerminal(
  options: {
    isRawModeSupported?: boolean;
    isColorEnabled?: boolean;
  } = {},
) {
  const input = new PassThrough();
  const outputChunks: string[] = [];
  const rawModeCalls: boolean[] = [];
  const closeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const mockInput = Object.assign(input, {
    isTTY: true,
    isRaw: false,
    setRawMode:
      options.isRawModeSupported !== false
        ? (mode: boolean) => {
            rawModeCalls.push(mode);
            mockInput.isRaw = mode;
          }
        : undefined,
  });

  const session: TerminalSession = {
    input: mockInput,
    output: {
      isTTY: true,
      write: (chunk: string) => {
        outputChunks.push(chunk);
        return true;
      },
    },
    isColorEnabled: options.isColorEnabled ?? true,
    isRawModeSupported: options.isRawModeSupported ?? true,
    close: closeSpy,
  };

  return {
    input: mockInput,
    session,
    rawModeCalls,
    closeSpy,
    getOutput: () => {
      return outputChunks.join("");
    },
  };
}

describe("runCli - interactive menus, /dev/tty isolation, and unattended fallback", () => {
  it("prompts via choice menu for choices and boolean askIfEmpty options while keeping stdout clean JSON", async () => {
    const stdout = _createMemoryStream(false);
    const ttyMock = _createInteractiveTerminal();
    const pipedStdin = new PassThrough();
    pipedStdin.end('{"fromPipe":true}');

    const cli = createCli("lint")
      .addOption({
        name: "--format",
        type: "string",
        required: true,
        choices: ["stylish", "agent", "json"] as const,
        askIfEmpty: true,
      })
      .addOption({
        name: "--fix",
        type: "boolean",
        required: false,
        defaultValue: false,
        askIfEmpty: { message: "Auto-fix issues?" },
      })
      .action(({ format, fix }) => {
        const rawChunk: unknown = pipedStdin.read();
        const pipedContent = Buffer.isBuffer(rawChunk)
          ? rawChunk.toString("utf8")
          : typeof rawChunk === "string"
            ? rawChunk
            : "";
        stdout.write(`${JSON.stringify({ format, fix, pipedContent })}\n`);
      });

    const runPromise = runCli({
      cli,
      input: [],
      stdin: Object.assign(pipedStdin, { isTTY: false }),
      stdout,
      stderr: _createMemoryStream(true),
      env: {},
      openTty: () => {
        return Promise.resolve(ttyMock.session);
      },
    });

    // Wait a tick for the first menu to attach, jump to "json" (G) so it
    // redraws, then confirm (Enter), then toggle Yes (k + Enter).
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    ttyMock.input.write("G");
    ttyMock.input.write("\r");
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    ttyMock.input.write("k\r");

    await runPromise;

    expect(JSON.parse(stdout.getOutput())).toEqual({
      format: "json",
      fix: true,
      pipedContent: '{"fromPipe":true}',
    });
    expect(ttyMock.closeSpy).toHaveBeenCalledTimes(1);
    expect(ttyMock.rawModeCalls).toEqual([true, false, true, false]);
    expect(ttyMock.getOutput()).toContain("❯ json");
  });

  it("opens a bare multi-command action menu, carries forward root globals, closes TTY before action, and runs the chosen subcommand", async () => {
    const stdout = _createMemoryStream(false);
    const ttyMock = _createInteractiveTerminal();
    let wasTtyClosedBeforeAction = false;

    const checkCmd = createCli("check")
      .description("Lint workspace")
      .action(() => {
        stdout.write("check\n");
      });

    const coverageCmd = createCli("coverage")
      .description("Inspect test coverage")
      .addOption({
        name: "--format",
        type: "string",
        required: true,
        choices: ["stylish", "json"] as const,
        askIfEmpty: true,
      })
      .action((args) => {
        const runtimeArgs: ActionArgs = args;
        wasTtyClosedBeforeAction = ttyMock.closeSpy.mock.calls.length === 1;
        stdout.write(
          `${JSON.stringify({
            cmd: "coverage",
            format: runtimeArgs.format,
            verbose: runtimeArgs.verbose,
          })}\n`,
        );
      });

    const rootCli = createCli("avandar-lint")
      .description("Workspace linter")
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"] as const,
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .addCommand("coverage", coverageCmd)
      .addCommand("check", checkCmd);

    const runPromise = runCli({
      cli: rootCli,
      input: ["--verbose"],
      stdout,
      stderr: _createMemoryStream(true),
      env: {},
      openTty: () => {
        return Promise.resolve(ttyMock.session);
      },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    // Commands sorted alphabetically: check (0), coverage (1). Press j + Enter
    // for coverage.
    ttyMock.input.write("j\r");
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    // Format menu: stylish (0), json (1). Press Down + Enter for json.
    ttyMock.input.write("\x1b[B\r");

    await runPromise;

    expect(wasTtyClosedBeforeAction).toBe(true);
    expect(JSON.parse(stdout.getOutput())).toEqual({
      cmd: "coverage",
      format: "json",
      verbose: true,
    });
  });

  it("aborts immediately on Ctrl-C in a menu without running subsequent prompts or actions", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const ttyMock = _createInteractiveTerminal();

    const cli = createCli("deploy")
      .addOption({
        name: "--env",
        type: "string",
        required: true,
        choices: ["dev", "prod"] as const,
        askIfEmpty: true,
      })
      .addOption({
        name: "--note",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    const runPromise = runCli({
      cli,
      input: [],
      stdout: _createMemoryStream(false),
      stderr: _createMemoryStream(true),
      env: {},
      openTty: () => {
        return Promise.resolve(ttyMock.session);
      },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    ttyMock.input.write("\x03");

    const error = await expectRejectedCliErrorCode(
      runPromise,
      "prompt_cancelled",
    );
    expect(error.usage).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
    expect(ttyMock.closeSpy).toHaveBeenCalledTimes(1);
    expect(ttyMock.input.isRaw).toBe(false);
  });

  it("fails fast with actionable flag and invocation guidance when unattended and required askIfEmpty values are missing", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const openTty = vi.fn<() => Promise<TerminalSession | undefined>>();

    const coverageCmd = createCli("coverage")
      .addOption({
        name: "--format",
        type: "string",
        required: true,
        choices: ["stylish", "json"] as const,
        askIfEmpty: true,
      })
      .action(action);
    const rootCli = createCli("avandar-lint").addCommand(
      "coverage",
      coverageCmd,
    );

    const noTtyError = await expectRejectedCliErrorCode(
      runCli({
        cli: rootCli,
        input: ["coverage"],
        stdin: Object.assign(new PassThrough(), { isTTY: false }),
        stdout: _createMemoryStream(false),
        stderr: _createMemoryStream(false),
        env: {},
        openTty,
      }),
      "missing_required_option",
    );

    expect(noTtyError.message).toContain("--format");
    expect(noTtyError.hint).toContain("avandar-lint coverage --format");
    expect(noTtyError.usage).toContain("avandar-lint coverage");
    expect(openTty).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();

    const noPromptError = await expectRejectedCliErrorCode(
      runCli({
        cli: rootCli,
        input: ["coverage", "--no-prompt"],
        terminal: _createInteractiveTerminal().session,
      }),
      "missing_required_option",
    );

    expect(noPromptError.hint).toContain("avandar-lint coverage --format");
    expect(action).not.toHaveBeenCalled();
  });

  it("uses defaults for optional askIfEmpty params when unattended and never opens /dev/tty when explicit values are given", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const openTty = vi.fn<() => Promise<TerminalSession | undefined>>();

    const cli = createCli("lint")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        choices: ["stylish", "json"] as const,
        defaultValue: "stylish",
        askIfEmpty: true,
      })
      .action(action);

    await runCli({
      cli,
      input: ["src/"],
      stdin: Object.assign(new PassThrough(), { isTTY: false }),
      stdout: _createMemoryStream(false),
      stderr: _createMemoryStream(false),
      env: {},
      openTty,
    });

    expect(action).toHaveBeenCalledWith({ target: "src/", format: "stylish" });
    expect(openTty).not.toHaveBeenCalled();

    action.mockClear();

    await runCli({
      cli,
      input: ["src/", "--format", "json"],
      stdin: Object.assign(new PassThrough(), { isTTY: true }),
      stdout: _createMemoryStream(true),
      stderr: _createMemoryStream(true),
      env: {},
      openTty,
    });

    expect(action).toHaveBeenCalledWith({ target: "src/", format: "json" });
    expect(openTty).not.toHaveBeenCalled();
  });
});
