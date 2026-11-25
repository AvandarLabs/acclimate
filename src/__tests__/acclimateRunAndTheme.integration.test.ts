import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Acclimate } from "@/Acclimate/Acclimate";
import { createTheme } from "@/theme/createTheme/createTheme";

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

function _createPromptIo(
  options: { isRawModeSupported?: boolean; isTty?: boolean } = {},
) {
  const input = Object.assign(new PassThrough(), {
    isTTY: options.isTty ?? true,
    isRaw: false,
    setRawMode:
      options.isRawModeSupported !== false ?
        (mode: boolean) => {
          input.isRaw = mode;
        }
      : undefined,
  });
  const output = _createMemoryStream(options.isTty ?? true);
  return { input, output };
}

afterEach(() => {
  Acclimate.resetTheme();
});

describe("Acclimate.run, Acclimate.execute, and semantic theming", () => {
  it("returns Promise<number> exit codes for success, help, unknown flags, validation errors, action errors, and prompt cancellation without calling process.exit or mutating process.exitCode", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit must never be called");
    });
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    const cli = Acclimate.createCli("ship")
      .description("Deploy a service")
      .addOption({
        name: "--env",
        type: "string",
        required: true,
        choices: ["dev", "prod"] as const,
        askIfEmpty: true,
      })
      .addOption({
        name: "--fail",
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(({ env, fail }) => {
        if (fail) {
          throw new Error("boom in action");
        }
        Acclimate.printSuccess(`Deployed to ${env}`);
        Acclimate.writeJson({ env, status: "ok" });
      });

    const helpStdout = _createMemoryStream(false);
    const helpStderr = _createMemoryStream(false);
    const helpCode = await Acclimate.run(cli, {
      args: ["--help"],
      stdout: helpStdout,
      stderr: helpStderr,
      env: {},
    });
    expect(helpCode).toBe(0);
    expect(helpStdout.getOutput()).toContain("ship");
    expect(helpStdout.getOutput()).not.toContain("\x1b[");
    expect(helpStderr.getOutput()).toBe("");

    const okStdout = _createMemoryStream(false);
    const okStderr = _createMemoryStream(true);
    const okCode = await Acclimate.run(cli, {
      args: ["--env", "prod"],
      stdout: okStdout,
      stderr: okStderr,
      env: { TERM: "xterm-256color" },
    });
    expect(okCode).toBe(0);
    expect(JSON.parse(okStdout.getOutput())).toEqual({
      env: "prod",
      status: "ok",
    });
    expect(okStderr.getOutput()).toContain(
      "\x1b[92m✅ Deployed to prod\x1b[0m",
    );

    const unknownStderr = _createMemoryStream(false);
    const unknownCode = await Acclimate.run(cli, {
      args: ["--bogus"],
      stdout: _createMemoryStream(false),
      stderr: unknownStderr,
      env: {},
    });
    expect(unknownCode).toBe(1);
    expect(unknownStderr.getOutput()).toContain('Unknown option "--bogus"');
    expect(unknownStderr.getOutput()).not.toContain("\x1b[");

    const invalidCode = await Acclimate.execute(cli, {
      args: ["--env", "staging"],
      stdout: _createMemoryStream(false),
      stderr: _createMemoryStream(false),
      env: {},
    });
    expect(invalidCode).toBe(1);

    const actionErrStderr = _createMemoryStream(false);
    const actionErrCode = await Acclimate.run(cli, {
      args: ["--env", "dev", "--fail"],
      stdout: _createMemoryStream(false),
      stderr: actionErrStderr,
      env: {},
    });
    expect(actionErrCode).toBe(1);
    expect(actionErrStderr.getOutput()).toContain("boom in action");

    const cancelIo = _createPromptIo();
    const cancelStderr = _createMemoryStream(false);
    const cancelPromise = Acclimate.run(cli, {
      args: [],
      stdout: _createMemoryStream(false),
      stderr: cancelStderr,
      promptIo: cancelIo,
      env: {},
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    cancelIo.input.write("\x03");
    expect(await cancelPromise).toBe(130);
    expect(cancelStderr.getOutput()).toContain("Cancelled");
    expect(cancelStderr.getOutput()).not.toContain("\x1b[");

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    process.exitCode = previousExitCode;
    exitSpy.mockRestore();
  });

  it("isolates injected stdout, stderr, env, theme, and promptIo across concurrent Acclimate.run calls", async () => {
    const cli = Acclimate.createCli("worker")
      .addPositionalArg({
        name: "label",
        type: "string",
        required: true,
      })
      .action(async ({ label }) => {
        Acclimate.printInfo(`Starting ${label}`);
        await new Promise((resolve) => {
          setTimeout(resolve, label === "first" ? 20 : 5);
        });
        Acclimate.printWarn(`Finishing ${label}`);
        Acclimate.writeData(`DATA:${label}`);
      });

    const firstStdout = _createMemoryStream(false);
    const firstStderr = _createMemoryStream(false);
    const secondStdout = _createMemoryStream(false);
    const secondStderr = _createMemoryStream(false);

    const [firstCode, secondCode] = await Promise.all([
      Acclimate.run(cli, {
        args: ["first"],
        stdout: firstStdout,
        stderr: firstStderr,
        isStderrTTY: true,
        env: { TERM: "xterm-256color" },
        theme: { info: "bright_magenta" },
      }),
      Acclimate.run(cli, {
        args: ["second"],
        stdout: secondStdout,
        stderr: secondStderr,
        isStderrTTY: true,
        env: { NO_COLOR: "1" },
      }),
    ]);

    expect(firstCode).toBe(0);
    expect(secondCode).toBe(0);
    expect(firstStdout.getOutput()).toBe("DATA:first\n");
    expect(secondStdout.getOutput()).toBe("DATA:second\n");
    expect(firstStderr.getOutput()).toContain(
      "\x1b[95mℹ️ Starting first\x1b[0m",
    );
    expect(firstStderr.getOutput()).toContain(
      "\x1b[93m⚠️ Finishing first\x1b[0m",
    );
    expect(secondStderr.getOutput()).not.toContain("\x1b[");
    expect(secondStderr.getOutput()).toContain("ℹ️ Starting second");
    expect(secondStderr.getOutput()).toContain("⚠️ Finishing second");
  });

  it("renders status print helpers with emoji and indented recovery hints while disabling ANSI under NO_COLOR, TERM=dumb, or non-TTY", () => {
    const ttyStderr = _createMemoryStream(true);
    Acclimate.printSuccess("All checks passed", {
      stream: ttyStderr,
      env: { TERM: "xterm-256color" },
    });
    Acclimate.printInfo("Scanning files", {
      stream: ttyStderr,
      env: { TERM: "xterm-256color" },
    });
    Acclimate.printWarn("Cache miss", {
      stream: ttyStderr,
      env: { TERM: "xterm-256color" },
    });
    Acclimate.printError("Could not authenticate", {
      stream: ttyStderr,
      env: { TERM: "xterm-256color" },
      hint: "Run gh auth login and retry.",
    });

    const ttyText = ttyStderr.getOutput();
    expect(ttyText).toContain("\x1b[92m✅ All checks passed\x1b[0m\n");
    expect(ttyText).toContain("\x1b[94mℹ️ Scanning files\x1b[0m\n");
    expect(ttyText).toContain("\x1b[93m⚠️ Cache miss\x1b[0m\n");
    expect(ttyText).toContain("\x1b[91m❌ Could not authenticate\x1b[0m\n");
    expect(ttyText).toContain(
      "  \x1b[93m⚠️ Run gh auth login and retry.\x1b[0m\n",
    );

    const plainStderr = _createMemoryStream(true);
    Acclimate.printError("Could not authenticate", {
      stream: plainStderr,
      env: { TERM: "dumb" },
      hint: "Run gh auth login and retry.",
    });
    expect(plainStderr.getOutput()).toBe(
      "❌ Could not authenticate\n  ⚠️ Run gh auth login and retry.\n",
    );
    expect(plainStderr.getOutput()).not.toContain("\x1b[");
  });

  it("applies Acclimate.setTheme across facade helpers and Acclimate.run without mutating standalone createTheme", async () => {
    Acclimate.setTheme({ accent: "bright_magenta", heading: "bright_green" });

    expect(Acclimate.theme.palette.accent).toBe("\x1b[95m");
    expect(createTheme({ color: true }).palette.accent).toBe("\x1b[96m");

    const cli = Acclimate.createCli("branded").description("Branded tool");
    const stdout = _createMemoryStream(false);

    const exitCode = await Acclimate.run(cli, {
      args: ["--help"],
      stdout,
      isStdoutTTY: true,
      env: { TERM: "xterm-256color" },
    });
    expect(exitCode).toBe(0);
    expect(stdout.getOutput()).toContain("\x1b[95mbranded\x1b[0m");
    expect(stdout.getOutput()).toContain("\x1b[92mUsage\x1b[0m");

    Acclimate.resetTheme();
    expect(Acclimate.theme.palette.accent).toBe("\x1b[96m");
  });
});
