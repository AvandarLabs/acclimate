import { CLIError } from "@/CLIError";
import { isColorEnabledForStream } from "@/terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import { formatCLIError } from "../formatCLIError/formatCLIError";
import { runCLI } from "../runCLI/runCLI";
import type { AnyCLI } from "../AcclimateCLI.types";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";

type ExecuteCLIOptions = {
  cli: AnyCLI;
  input: readonly string[];
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  terminal?: TerminalSession;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
  onExitCode?: (exitCode: number) => void;
};

/**
 * Executes a CLI at a process boundary, writing help to `stdout`, rendering
 * `CLIError` messages with recovery hints and usage to `stderr`, and returning
 * the resulting exit status (`0` on success or help, `130` on prompt
 * cancellation, and `1` on other failures).
 *
 * Use at CLI entry points (for example `Acclimate.run`) or in deterministic
 * test harnesses with custom streams and terminal sessions.
 */
export async function executeCLI(
  options: Readonly<ExecuteCLIOptions>,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;

  try {
    await runCLI({
      cli: options.cli,
      input: options.input,
      stdin: options.stdin,
      stdout,
      stderr,
      env,
      terminal: options.terminal,
      interactive: options.interactive,
      openTty: options.openTty,
    });
    return 0;
  } catch (error) {
    const isColorEnabled = isColorEnabledForStream({ stream: stderr, env });
    const exitCode =
      error instanceof CLIError && error.code === "prompt_cancelled" ? 130 : 1;
    const errorOutput =
      error instanceof CLIError ?
        formatCLIError(error, { color: isColorEnabled })
      : error instanceof Error ? (error.stack ?? error.message)
      : String(error);
    stderr.write(`${errorOutput}\n`);
    options.onExitCode?.(exitCode);
    return exitCode;
  }
}
