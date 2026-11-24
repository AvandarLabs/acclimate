import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { makeTerminalSessionFromPromptIo } from "./makeTerminalSessionFromPromptIo";

describe("makeTerminalSessionFromPromptIo", () => {
  it("derives color and raw-mode capabilities from stream metadata and env when omitted", async () => {
    const closeSpy = vi.fn<() => void>();
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => {},
    });
    const output = {
      isTTY: true,
      write: () => {
        return true;
      },
    };

    const ttySession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output, close: closeSpy },
      env: { TERM: "xterm-256color" },
    });

    expect(ttySession.isColorEnabled).toBe(true);
    expect(ttySession.isRawModeSupported).toBe(true);
    await ttySession.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const noColorSession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output },
      env: { NO_COLOR: "1" },
    });
    expect(noColorSession.isColorEnabled).toBe(false);
    expect(noColorSession.isRawModeSupported).toBe(true);

    const dumbSession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output },
      env: { TERM: "dumb" },
    });
    expect(dumbSession.isColorEnabled).toBe(false);
    expect(dumbSession.isRawModeSupported).toBe(false);
  });

  it("honors explicit isColorEnabled and isRawModeSupported overrides", () => {
    const session = makeTerminalSessionFromPromptIo({
      promptIo: {
        input: new PassThrough(),
        output: {
          isTTY: false,
          write: () => {
            return true;
          },
        },
        isColorEnabled: true,
        isRawModeSupported: true,
      },
      env: { NO_COLOR: "1", TERM: "dumb" },
    });

    expect(session.isColorEnabled).toBe(true);
    expect(session.isRawModeSupported).toBe(true);
  });
});
