/**
 * Shared test assertions and types for the `runCLI` split test suite.
 */
import { PassThrough } from "node:stream";
import { expect, vi } from "vitest";
import { CLIError } from "@/CLIError";
import type { CLIParamDataType } from "@/AcclimateCLI/AcclimateCLI.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

/** Generic action callback arguments record used by `runCLI` test spies. */
export type ActionArgs = Record<string, CLIParamDataType>;

/** Creates an in-memory interactive `TerminalSession` for `runCLI` tests. */
export function createMockTerminalSession(
  options: {
    isRawModeSupported?: boolean;
    isColorEnabled?: boolean;
  } = {},
): {
  input: PassThrough & { isTTY: boolean; isRaw: boolean };
  session: TerminalSession;
  rawModeCalls: boolean[];
  closeSpy: ReturnType<typeof vi.fn>;
  getOutput: () => string;
} {
  const inputStream = new PassThrough();
  const outputChunks: string[] = [];
  const rawModeCalls: boolean[] = [];
  const closeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const mockInput = Object.assign(inputStream, {
    isTTY: true,
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

/**
 * Asserts that `promise` rejects with a `CLIError` carrying `expectedCode`,
 * returning the narrowed `CLIError` instance for additional assertions.
 */
export async function expectRejectedCLIErrorCode(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<CLIError> {
  let caughtError: unknown;
  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CLIError);
  if (!(caughtError instanceof CLIError)) {
    throw new Error("Expected CLIError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}
