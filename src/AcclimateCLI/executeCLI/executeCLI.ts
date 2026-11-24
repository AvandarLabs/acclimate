import { CLIError } from "@/CLIError";
import { formatCLIError } from "../formatCLIError/formatCLIError";
import { runCLI } from "../runCLI/runCLI";
import type { AnyCLI, OutputStream } from "../AcclimateCLI.types";

type ExecuteCLIOptions = {
  cli: AnyCLI;
  input: readonly string[];
  stdout?: OutputStream;
  stderr?: OutputStream;
  onExitCode?: (exitCode: number) => void;
};

/**
 * Executes a CLI at a process boundary, writing help to `stdout`, rendering
 * `CLIError` messages with recovery hints and usage to `stderr`, and returning
 * the resulting exit status (`0` on success or help, `1` on failure).
 *
 * Use at CLI entry points (for example `Acclimate.run`) or in deterministic
 * test harnesses with custom `stdout`/`stderr` streams.
 */
export async function executeCLI(
  options: Readonly<ExecuteCLIOptions>,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    await runCLI({ cli: options.cli, input: options.input, stdout });
    return 0;
  } catch (error) {
    const errorOutput =
      error instanceof CLIError ? formatCLIError(error)
      : error instanceof Error ? (error.stack ?? error.message)
      : String(error);
    stderr.write(`${errorOutput}\n`);
    options.onExitCode?.(1);
    return 1;
  }
}
