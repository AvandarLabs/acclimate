/**
 * Shared test assertions and types for the `runCli` split test suite.
 */
import { PassThrough } from "node:stream";
import { expect, vi } from "vitest";
import { CliError } from "@/CliError";
import type { CliParamDataType } from "@/AcclimateCli/AcclimateCli.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

/** Generic action callback arguments record used by `runCli` test spies. */
export type ActionArgs = Record<string, CliParamDataType>;

/** Creates an in-memory interactive `TerminalSession` for `runCli` tests. */
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
 * Asserts that `promise` rejects with a `CliError` carrying `expectedCode`,
 * returning the narrowed `CliError` instance for additional assertions.
 */
export async function expectRejectedCliErrorCode(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<CliError> {
  let caughtError: unknown;
  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CliError);
  if (!(caughtError instanceof CliError)) {
    throw new Error("Expected CliError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}
