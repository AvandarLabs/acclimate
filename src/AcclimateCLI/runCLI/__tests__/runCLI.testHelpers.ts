/**
 * Shared test assertions and types for the `runCLI` split test suite.
 */
import { expect } from "vitest";
import { CLIError } from "@/CLIError";
import type { CLIParamDataType } from "@/AcclimateCLI/AcclimateCLI.types";

/** Generic action callback arguments record used by `runCLI` test spies. */
export type ActionArgs = Record<string, CLIParamDataType>;

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
