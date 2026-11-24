import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLineReader } from "./createLineReader";
import type { TerminalSession } from "../terminalSession.types";

function _createTestSession(isRawModeSupported: boolean) {
  const input = new PassThrough();
  const outputChunks: string[] = [];
  const session: TerminalSession = {
    input,
    output: {
      isTTY: isRawModeSupported,
      write: (chunk: string) => {
        outputChunks.push(chunk);
        return true;
      },
    },
    isColorEnabled: false,
    isRawModeSupported,
    close: async () => {},
  };

  return {
    input,
    session,
    getOutput: () => {
      return outputChunks.join("");
    },
  };
}

describe("createLineReader", () => {
  it("reads queued lines in order without dropping buffered input", async () => {
    const testTerminal = _createTestSession(false);
    const reader = createLineReader({
      session: testTerminal.session,
      cliName: "demo",
    });

    testTerminal.input.write("first\nsecond\n");

    const first = await reader.readLine("Prompt 1: ");
    const second = await reader.readLine("Prompt 2: ");
    reader.close();

    expect(first).toBe("first");
    expect(second).toBe("second");
    expect(testTerminal.getOutput()).toContain("Prompt 1: ");
    expect(testTerminal.getOutput()).toContain("Prompt 2: ");
  });

  it("rejects with prompt_cancelled when the input stream ends at EOF", async () => {
    const testTerminal = _createTestSession(false);
    const reader = createLineReader({
      session: testTerminal.session,
      cliName: "demo",
    });

    testTerminal.input.end();

    await expect(reader.readLine("Value: ")).rejects.toMatchObject({
      code: "prompt_cancelled",
    });
    reader.close();
  });
});
