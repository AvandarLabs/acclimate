import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { requestTerminalInput } from "./requestTerminalInput";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _createTestTerminal(
  options: {
    isRawModeSupported?: boolean;
    isColorEnabled?: boolean;
  } = {},
) {
  const input = new PassThrough();
  const outputChunks: string[] = [];
  const rawModeCalls: boolean[] = [];

  const mockInput = Object.assign(input, {
    isTTY: options.isRawModeSupported ?? false,
    isRaw: false,
    setRawMode:
      options.isRawModeSupported ?
        (mode: boolean) => {
          rawModeCalls.push(mode);
          mockInput.isRaw = mode;
        }
      : undefined,
  });

  const session: TerminalSession = {
    input: mockInput,
    output: {
      isTTY: options.isColorEnabled ?? true,
      write: (chunk: string) => {
        outputChunks.push(chunk);
        return true;
      },
    },
    isColorEnabled: options.isColorEnabled ?? true,
    isRawModeSupported: options.isRawModeSupported ?? false,
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  return {
    input: mockInput,
    session,
    rawModeCalls,
    getOutput: () => {
      return outputChunks.join("");
    },
  };
}

describe("requestTerminalInput", () => {
  it("writes interpolated prompt and optional notice to the terminal session without touching stdout", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });
    const terminal = _createTestTerminal();
    terminal.input.write("alpha\n");

    const result = await requestTerminalInput({
      message: "|bright_cyan|Target for $env$|reset|",
      params: { env: "dev" },
      responseOptions: { required: false },
      terminal: terminal.session,
    });

    expect(result).toBe("alpha");
    expect(terminal.getOutput()).toContain(
      generateTerminalMessage(
        "|bright_cyan|Target for $env$|reset| |gray|(press Enter to leave empty)|reset| ",
        { env: "dev" },
      ),
    );
    expect(stdoutSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
  });

  it("returns undefined when optional input is blank and stringified defaultValue when provided", async () => {
    const blankTerminal = _createTestTerminal();
    blankTerminal.input.write("\n");

    const optionalResult = await requestTerminalInput({
      message: "Provide a note",
      params: {},
      responseOptions: { required: false },
      terminal: blankTerminal.session,
    });
    expect(optionalResult).toBeUndefined();

    const defaultTerminal = _createTestTerminal();
    defaultTerminal.input.write("\n");

    const defaultResult = await requestTerminalInput({
      message: "Retry count",
      params: {},
      responseOptions: { required: false, type: "number", defaultValue: 3 },
      terminal: defaultTerminal.session,
    });
    expect(defaultResult).toBe("3");
  });

  it("re-prompts on session output when required text or numeric input is invalid", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });
    const requiredTerminal = _createTestTerminal();
    requiredTerminal.input.write("\nvalue\n");

    const requiredResult = await requestTerminalInput({
      message: "Enter value",
      params: {},
      responseOptions: { required: true },
      terminal: requiredTerminal.session,
    });

    expect(requiredResult).toBe("value");
    expect(requiredTerminal.getOutput()).toContain("This value is required.");

    const numericTerminal = _createTestTerminal();
    numericTerminal.input.write("not-a-number\n42\n");

    const numericResult = await requestTerminalInput({
      message: "Enter port",
      params: {},
      responseOptions: { required: true, type: "number" },
      terminal: numericTerminal.session,
    });

    expect(numericResult).toBe("42");
    expect(numericTerminal.getOutput()).toContain("not a valid number");
    expect(stdoutSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
  });

  it("uses the Yes/No choice menu for boolean prompts on raw-capable TTYs and validates y/n on non-raw sessions", async () => {
    const rawTerminal = _createTestTerminal({ isRawModeSupported: true });
    const rawPromise = requestTerminalInput({
      message: "Enable feature?",
      params: {},
      responseOptions: { required: false, type: "boolean", defaultValue: true },
      terminal: rawTerminal.session,
    });

    rawTerminal.input.write("j\r");
    await expect(rawPromise).resolves.toBe("false");
    expect(rawTerminal.rawModeCalls).toEqual([true, false]);

    const plainTerminal = _createTestTerminal({
      isRawModeSupported: false,
      isColorEnabled: false,
    });
    plainTerminal.input.write("maybe\nn\n");

    const plainResult = await requestTerminalInput({
      message: "Enable feature?",
      params: {},
      responseOptions: { required: false, type: "boolean" },
      terminal: plainTerminal.session,
    });

    expect(plainResult).toBe("false");
    expect(plainTerminal.getOutput()).toContain("Please enter y or n.");
  });

  it("delegates choices prompts to the interactive choice menu and returns the chosen string", async () => {
    const rawTerminal = _createTestTerminal({ isRawModeSupported: true });
    const choicePromise = requestTerminalInput({
      message: "Choose format",
      params: {},
      responseOptions: {
        required: true,
        type: "string",
        choices: ["stylish", "agent", "json"],
        defaultValue: "stylish",
      },
      terminal: rawTerminal.session,
    });

    rawTerminal.input.write("G\r");
    await expect(choicePromise).resolves.toBe("json");
  });

  it("rejects with prompt_cancelled on EOF without hanging", async () => {
    const terminal = _createTestTerminal();
    terminal.input.end();

    await expect(
      requestTerminalInput({
        message: "Enter token",
        params: {},
        responseOptions: { required: true },
        terminal: terminal.session,
      }),
    ).rejects.toMatchObject({ code: "prompt_cancelled" });
  });

  it("uses defaults for optional prompts and fails fast for required prompts when unattended", async () => {
    const optionalWithDefault = await requestTerminalInput({
      message: "Region",
      params: {},
      responseOptions: {
        required: false,
        type: "string",
        defaultValue: "us-east-1",
      },
      interactive: false,
    });
    expect(optionalWithDefault).toBe("us-east-1");

    const optionalWithoutDefault = await requestTerminalInput({
      message: "Note",
      params: {},
      responseOptions: { required: false },
      interactive: false,
    });
    expect(optionalWithoutDefault).toBeUndefined();

    await expect(
      requestTerminalInput({
        message: "API token",
        params: {},
        responseOptions: { required: true },
        interactive: false,
      }),
    ).rejects.toMatchObject({ code: "interactive_input_unavailable" });
  });
});
