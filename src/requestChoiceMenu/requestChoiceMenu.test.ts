import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CLIError } from "@/CLIError";
import { createTheme } from "@/theme/createTheme/createTheme";
import { requestChoiceMenu } from "./requestChoiceMenu";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _createMockTerminal(
  options: {
    isRawModeSupported?: boolean;
    isColorEnabled?: boolean;
  } = {},
) {
  const inputStream = new PassThrough();
  const outputChunks: string[] = [];
  const rawModeCalls: boolean[] = [];

  const mockInput = Object.assign(inputStream, {
    isTTY: true,
    isRaw: false,
    setRawMode:
      options.isRawModeSupported !== false ?
        (mode: boolean) => {
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
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  return {
    session,
    input: mockInput,
    rawModeCalls,
    getOutput: () => {
      return outputChunks.join("");
    },
  };
}

describe("requestChoiceMenu", () => {
  it("navigates with arrows and j/k wrapping, jumps with g/G, confirms on Enter, and restores terminal state", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });
    const mock = _createMockTerminal();

    const selectionPromise = requestChoiceMenu({
      message: "Output format",
      choices: [{ value: "stylish" }, { value: "agent" }, { value: "json" }],
      terminal: mock.session,
    });

    // k wraps from 0 -> 2, j wraps from 2 -> 0, G jumps to 2, g jumps to 0, Down moves to 1, Enter confirms "agent".
    mock.input.write("kjGg\x1b[B\r");

    const selected = await selectionPromise;

    expect(selected).toBe("agent");
    expect(mock.rawModeCalls).toEqual([true, false]);
    expect(mock.input.isRaw).toBe(false);
    expect(mock.input.listenerCount("data")).toBe(0);
    expect(mock.getOutput()).toContain("\x1b[?25h");
    expect(mock.getOutput()).toContain("agent");
    expect(stdoutSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
  });

  it("starts highlighted on defaultValue and confirms immediately on Enter", async () => {
    const mock = _createMockTerminal();

    const selectionPromise = requestChoiceMenu({
      message: "Enable strict mode?",
      choices: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
      defaultValue: "false",
      terminal: mock.session,
    });

    mock.input.write("\r");

    await expect(selectionPromise).resolves.toBe("false");
    expect(mock.rawModeCalls).toEqual([true, false]);
  });

  it("cancels cleanly on Ctrl-C with prompt_cancelled and restores raw mode and cursor", async () => {
    const mock = _createMockTerminal();

    const selectionPromise = requestChoiceMenu({
      message: "Pick target",
      choices: [{ value: "web" }, { value: "api" }],
      cliName: "avandar-lint",
      terminal: mock.session,
    });

    mock.input.write("\x03");

    const caughtError = await selectionPromise.catch((error: unknown) => {
      return error;
    });

    expect(caughtError).toBeInstanceOf(CLIError);
    if (!(caughtError instanceof CLIError)) {
      throw new Error("Expected CLIError");
    }
    expect(caughtError.code).toBe("prompt_cancelled");
    expect(mock.rawModeCalls).toEqual([true, false]);
    expect(mock.input.isRaw).toBe(false);
    expect(mock.input.listenerCount("data")).toBe(0);
    expect(mock.getOutput()).toContain("\x1b[?25h");
  });

  it("cancels cleanly on Ctrl-D and stream EOF while restoring raw mode", async () => {
    const ctrlDMock = _createMockTerminal();
    const ctrlDPromise = requestChoiceMenu({
      message: "Pick target",
      choices: [{ value: "web" }, { value: "api" }],
      terminal: ctrlDMock.session,
    });
    ctrlDMock.input.write("\x04");
    await expect(ctrlDPromise).rejects.toMatchObject({
      code: "prompt_cancelled",
    });
    expect(ctrlDMock.rawModeCalls).toEqual([true, false]);

    const eofMock = _createMockTerminal();
    const eofPromise = requestChoiceMenu({
      message: "Pick target",
      choices: [{ value: "web" }, { value: "api" }],
      terminal: eofMock.session,
    });
    eofMock.input.end();
    await expect(eofPromise).rejects.toMatchObject({
      code: "prompt_cancelled",
    });
    expect(eofMock.rawModeCalls).toEqual([true, false]);
  });

  it("renders a plain numbered fallback menu without ANSI cursor controls when raw mode is unsupported and re-prompts on invalid input", async () => {
    const mock = _createMockTerminal({
      isRawModeSupported: false,
      isColorEnabled: false,
    });

    const selectionPromise = requestChoiceMenu({
      message: "Choose format",
      choices: [{ value: "stylish" }, { value: "json" }],
      defaultValue: "stylish",
      terminal: mock.session,
    });

    mock.input.write("invalid\n");
    mock.input.write("2\n");

    const selected = await selectionPromise;

    expect(selected).toBe("json");
    expect(mock.getOutput()).not.toContain("\x1b[");
    expect(mock.getOutput()).toContain("1. stylish");
    expect(mock.getOutput()).toContain("2. json");
    expect(mock.getOutput()).toContain("Invalid selection");
  });

  it("rejects with interactive_input_unavailable when interactive is false", async () => {
    await expect(
      requestChoiceMenu({
        message: "Choose format",
        choices: [{ value: "stylish" }, { value: "json" }],
        interactive: false,
      }),
    ).rejects.toMatchObject({
      code: "interactive_input_unavailable",
    });
  });

  it("throws when choices is empty", async () => {
    const mock = _createMockTerminal();

    await expect(
      requestChoiceMenu({
        message: "Empty",
        choices: [],
        terminal: mock.session,
      }),
    ).rejects.toThrow("at least one choice");
  });

  it("renders plain text without ANSI escapes via promptIo under NO_COLOR and applies custom theme roles on color TTYs", async () => {
    const plainInput = new PassThrough();
    const plainChunks: string[] = [];
    const customTheme = createTheme({
      color: true,
      palette: { prompt: "bright_magenta", success: "bright_cyan" },
    });

    const plainPromise = requestChoiceMenu({
      message: "Choose env",
      choices: [{ value: "dev" }, { value: "prod" }],
      promptIo: {
        input: plainInput,
        output: {
          isTTY: true,
          write: (chunk: string) => {
            plainChunks.push(chunk);
            return true;
          },
        },
      },
      env: { NO_COLOR: "1" },
      theme: customTheme,
    });

    plainInput.write("2\n");
    await expect(plainPromise).resolves.toBe("prod");
    expect(plainChunks.join("")).not.toContain("\x1b[");
    expect(plainChunks.join("")).toContain("? Choose env");

    const rawMock = _createMockTerminal({ isColorEnabled: true });
    const styledPromise = requestChoiceMenu({
      message: "Choose env",
      choices: [{ value: "dev" }, { value: "prod" }],
      terminal: rawMock.session,
      theme: customTheme,
    });

    rawMock.input.write("\r");
    await expect(styledPromise).resolves.toBe("dev");
    expect(rawMock.getOutput()).toContain("\x1b[96m✔\x1b[0m");
    expect(rawMock.getOutput()).toContain("\x1b[95mChoose env\x1b[0m");
  });
});
