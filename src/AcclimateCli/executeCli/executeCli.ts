import { CliError } from "@/CliError";
import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import { formatCliError } from "../formatCliError/formatCliError";
import { runCli } from "../runCli/runCli";
import type { AnyCli } from "../AcclimateCli.types";
import type {
  PromptIo,
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { ThemeInput } from "@/theme/theme.types";

/** Options accepted by `executeCli` for boundary and in-process execution. */
export type ExecuteCliOptions = {
  cli: AnyCli;
  input?: readonly string[];
  args?: readonly string[];
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  isStdoutTTY?: boolean;
  isStderrTTY?: boolean;
  terminal?: TerminalSession;
  promptIo?: PromptIo;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
  theme?: ThemeInput;
  onExitCode?: (exitCode: number) => void;
};

/**
 * Executes a CLI at a process or embedded boundary, writing themed or plain
 * help to `stdout`, rendering `CliError` messages with recovery hints and usage
 * to `stderr`, and returning the exit status (`0` on success or help, `130` on
 * prompt cancellation, and `1` on other failures) without calling
 * `process.exit()`.
 *
 * Use at CLI entry points (for example `Acclimate.run` and `Acclimate.execute`)
 * or in deterministic test harnesses with injected streams and `promptIo`.
 */
export async function executeCli(
  options: Readonly<ExecuteCliOptions>,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const input = options.args ?? options.input ?? process.argv.slice(2);

  try {
    await runCli({
      cli: options.cli,
      input,
      stdin: options.stdin,
      stdout,
      stderr,
      env,
      isStdoutTTY: options.isStdoutTTY,
      isStderrTTY: options.isStderrTTY,
      terminal: options.terminal,
      promptIo: options.promptIo,
      interactive: options.interactive,
      openTty: options.openTty,
      theme: options.theme,
    });
    return 0;
  } catch (error) {
    const stderrTheme = makeThemeFromOptions({
      theme: options.theme,
      stream: stderr,
      isTTY: options.isStderrTTY,
      env,
    });
    const exitCode =
      error instanceof CliError && error.code === "prompt_cancelled" ? 130 : 1;
    const errorOutput =
      error instanceof CliError ? formatCliError(error, { theme: stderrTheme })
      : error instanceof Error ? (error.stack ?? error.message)
      : String(error);
    stderr.write(`${errorOutput}\n`);
    options.onExitCode?.(exitCode);
    return exitCode;
  }
}
