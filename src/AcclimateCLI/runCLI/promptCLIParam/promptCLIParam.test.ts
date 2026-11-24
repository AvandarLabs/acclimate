import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CLIError } from "@/CLIError";
import { promptCLIParam } from "./promptCLIParam";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _createInteractiveSession(
  options: {
    isRawModeSupported?: boolean;
  } = {},
) {
  const input = new PassThrough();
  const outputChunks: string[] = [];
  const rawModeCalls: boolean[] = [];

  const mockInput = Object.assign(input, {
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
    isColorEnabled: true,
    isRawModeSupported: options.isRawModeSupported ?? true,
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

describe("promptCLIParam", () => {
  it("opens an interactive choice menu when choices are configured", async () => {
    const mock = _createInteractiveSession();

    const valuePromise = promptCLIParam({
      cliName: "avandar-lint coverage",
      paramKind: "option",
      param: {
        name: "--format",
        type: "string",
        required: true,
        choices: ["stylish", "agent", "json"],
        defaultValue: "stylish",
        askIfEmpty: true,
      },
      getTerminalSession: () => {
        return Promise.resolve(mock.session);
      },
    });

    mock.input.write("G\r");
    await expect(valuePromise).resolves.toBe("json");
  });

  it("opens a Yes/No choice menu for boolean parameters on a raw-capable TTY", async () => {
    const mock = _createInteractiveSession({ isRawModeSupported: true });

    const valuePromise = promptCLIParam({
      cliName: "demo",
      paramKind: "option",
      param: {
        name: "--confirm",
        type: "boolean",
        required: false,
        defaultValue: false,
        askIfEmpty: { message: "Continue with execution?" },
      },
      getTerminalSession: () => {
        return Promise.resolve(mock.session);
      },
    });

    mock.input.write("k\r");
    await expect(valuePromise).resolves.toBe("true");
  });

  it("throws an actionable missing_required_option error naming the flag and invocation when unattended", async () => {
    const caught = await promptCLIParam({
      cliName: "avandar-lint coverage",
      paramKind: "option",
      param: {
        name: "--format",
        type: "string",
        required: true,
        choices: ["stylish", "json"],
        askIfEmpty: true,
      },
      getTerminalSession: () => {
        return Promise.resolve(undefined);
      },
    }).catch((error: unknown) => {
      return error;
    });

    expect(caught).toBeInstanceOf(CLIError);
    if (!(caught instanceof CLIError)) {
      throw new Error("Expected CLIError");
    }
    expect(caught.code).toBe("missing_required_option");
    expect(caught.message).toContain("--format");
    expect(caught.message).toContain("unattended");
    expect(caught.hint).toContain("avandar-lint coverage --format");
  });

  it("throws an actionable missing_required_positional_arg error naming the argument when unattended", async () => {
    const caught = await promptCLIParam({
      cliName: "avandar-lint coverage",
      paramKind: "positional",
      param: {
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      },
      getTerminalSession: () => {
        return Promise.resolve(undefined);
      },
    }).catch((error: unknown) => {
      return error;
    });

    expect(caught).toBeInstanceOf(CLIError);
    if (!(caught instanceof CLIError)) {
      throw new Error("Expected CLIError");
    }
    expect(caught.code).toBe("missing_required_positional_arg");
    expect(caught.message).toContain("target");
    expect(caught.hint).toContain("avandar-lint coverage <target>");
  });

  it("returns undefined without prompting for optional params when unattended", async () => {
    const result = await promptCLIParam({
      cliName: "demo",
      paramKind: "option",
      param: {
        name: "--format",
        type: "string",
        required: false,
        defaultValue: "stylish",
        askIfEmpty: true,
      },
      getTerminalSession: () => {
        return Promise.resolve(undefined);
      },
    });

    expect(result).toBeUndefined();
  });
});
