import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { openTerminalSession } from "./openTerminalSession";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "../terminalSession.types";

function _createFakeInput(options: {
  isTty?: boolean;
  withRawMode?: boolean;
}): PassThrough &
  TerminalInputStream & {
    setRawModeSpy: ReturnType<typeof vi.fn>;
    pauseSpy: ReturnType<typeof vi.fn>;
  } {
  const stream = new PassThrough();
  const originalPause = stream.pause.bind(stream);
  const setRawModeSpy = vi.fn<(mode: boolean) => void>((mode) => {
    fakeStream.isRaw = mode;
  });
  const pauseSpy = vi.fn(() => {
    originalPause();
  });
  const fakeStream = Object.assign(stream, {
    isTTY: options.isTty,
    isRaw: false,
    setRawMode: options.withRawMode ? setRawModeSpy : undefined,
    setRawModeSpy,
    pauseSpy,
  });
  fakeStream.pause = () => {
    pauseSpy();
    return fakeStream;
  };
  return fakeStream;
}

function _createFakeOutput(isTty?: boolean): TerminalOutputStream {
  return {
    isTTY: isTty,
    write: () => {
      return true;
    },
  };
}

describe("openTerminalSession", () => {
  it("returns undefined without calling openTty when interactive is false", async () => {
    const openTty = vi.fn<() => Promise<TerminalSession | undefined>>();

    const session = await openTerminalSession({
      interactive: false,
      stdin: _createFakeInput({ isTty: true, withRawMode: true }),
      stderr: _createFakeOutput(true),
      env: {},
      openTty,
    });

    expect(session).toBeUndefined();
    expect(openTty).not.toHaveBeenCalled();
  });

  it("wraps an injected session without closing the caller session on close", async () => {
    const callerClose = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const injected: TerminalSession = {
      input: _createFakeInput({ isTty: true, withRawMode: true }),
      output: _createFakeOutput(true),
      isColorEnabled: true,
      isRawModeSupported: true,
      close: callerClose,
    };

    const session = await openTerminalSession({ session: injected });

    expect(session).toBeDefined();
    expect(session?.input).toBe(injected.input);
    expect(session?.output).toBe(injected.output);
    await session?.close();
    expect(callerClose).not.toHaveBeenCalled();
  });

  it("returns undefined without calling openTty when CI is enabled", async () => {
    const openTty = vi.fn<() => Promise<TerminalSession | undefined>>();

    const session = await openTerminalSession({
      stdin: _createFakeInput({ isTty: true, withRawMode: true }),
      stderr: _createFakeOutput(true),
      env: { CI: "true" },
      openTty,
    });

    expect(session).toBeUndefined();
    expect(openTty).not.toHaveBeenCalled();
  });

  it("returns undefined without calling openTty when no standard stream is a TTY", async () => {
    const openTty = vi.fn<() => Promise<TerminalSession | undefined>>();

    const session = await openTerminalSession({
      stdin: _createFakeInput({ isTty: false }),
      stdout: _createFakeOutput(false),
      stderr: _createFakeOutput(false),
      env: {},
      openTty,
    });

    expect(session).toBeUndefined();
    expect(openTty).not.toHaveBeenCalled();
  });

  it("opens controlling terminal via openTty when stdin and stdout are piped but stderr is a TTY", async () => {
    const ttySession: TerminalSession = {
      input: _createFakeInput({ isTty: true, withRawMode: true }),
      output: _createFakeOutput(true),
      isColorEnabled: true,
      isRawModeSupported: true,
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const openTty = vi
      .fn<() => Promise<TerminalSession | undefined>>()
      .mockResolvedValue(ttySession);

    const session = await openTerminalSession({
      stdin: _createFakeInput({ isTty: false }),
      stdout: _createFakeOutput(false),
      stderr: _createFakeOutput(true),
      env: {},
      openTty,
    });

    expect(openTty).toHaveBeenCalledTimes(1);
    expect(session).toBe(ttySession);
  });

  it("falls back to stdin and stderr when openTty fails and both are TTYs, restoring raw mode on close", async () => {
    const stdin = _createFakeInput({ isTty: true, withRawMode: true });
    const stderr = _createFakeOutput(true);
    const openTty = vi
      .fn<() => Promise<TerminalSession | undefined>>()
      .mockResolvedValue(undefined);

    const session = await openTerminalSession({
      stdin,
      stdout: _createFakeOutput(false),
      stderr,
      env: { TERM: "xterm-256color" },
      openTty,
    });

    expect(session).toBeDefined();
    expect(session?.input).toBe(stdin);
    expect(session?.output).toBe(stderr);
    expect(session?.isColorEnabled).toBe(true);
    expect(session?.isRawModeSupported).toBe(true);

    stdin.setRawMode?.(true);
    await session?.close();
    expect(stdin.setRawModeSpy).toHaveBeenLastCalledWith(false);
    expect(stdin.pauseSpy).toHaveBeenCalled();
    expect(stdin.destroyed).toBe(false);
  });

  it("never falls back to piped stdin or stdout when openTty is unavailable", async () => {
    const openTty = vi
      .fn<() => Promise<TerminalSession | undefined>>()
      .mockResolvedValue(undefined);

    const pipedStdinSession = await openTerminalSession({
      stdin: _createFakeInput({ isTty: false }),
      stdout: _createFakeOutput(true),
      stderr: _createFakeOutput(true),
      env: {},
      openTty,
    });
    expect(pipedStdinSession).toBeUndefined();

    const redirectedStderrSession = await openTerminalSession({
      stdin: _createFakeInput({ isTty: true, withRawMode: true }),
      stdout: _createFakeOutput(true),
      stderr: _createFakeOutput(false),
      env: {},
      openTty,
    });
    expect(redirectedStderrSession).toBeUndefined();
  });

  it("disables raw mode and color on fallback TTY when TERM is dumb", async () => {
    const session = await openTerminalSession({
      stdin: _createFakeInput({ isTty: true, withRawMode: true }),
      stderr: _createFakeOutput(true),
      env: { TERM: "dumb" },
      openTty: () => {
        return Promise.resolve(undefined);
      },
    });

    expect(session?.isRawModeSupported).toBe(false);
    expect(session?.isColorEnabled).toBe(false);
  });
});
