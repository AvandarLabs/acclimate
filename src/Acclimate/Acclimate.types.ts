import type { AnyCli, IAcclimateCli } from "@/AcclimateCli/AcclimateCli.types";
import type { ChoiceMenuOptions } from "@/requestChoiceMenu/requestChoiceMenu.types";
import type { RequestTerminalInputOptions } from "@/requestTerminalInput/requestTerminalInput";
import type {
  PromptIo,
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type {
  CreateThemeOptions,
  SemanticTheme,
  SemanticThemePaletteOverrides,
  ThemeInput,
} from "@/theme/theme.types";

/** Options accepted by `Acclimate.log` for stream, color, and theme control. */
export type AcclimateLogOptions = {
  stream?: TerminalOutputStream;
  color?: boolean;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  theme?: ThemeInput;
};

/**
 * Options accepted by `Acclimate.printSuccess`, `printInfo`, and `printWarn`.
 */
export type AcclimateStatusPrintOptions = {
  stream?: TerminalOutputStream;
  color?: boolean;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  theme?: ThemeInput;
};

/** Options accepted by `Acclimate.printError`, including a recovery hint. */
export type AcclimateErrorPrintOptions = AcclimateStatusPrintOptions & {
  hint?: string;
};

/**
 * Injectable execution options accepted by `Acclimate.run` and
 * `Acclimate.execute` for in-process integration testing and embedding.
 */
export type AcclimateRunOptions = {
  /** CLI argument tokens (defaults to `process.argv.slice(2)`). */
  args?: readonly string[];

  /** Readable input stream (defaults to `process.stdin`). */
  stdin?: TerminalInputStream;

  /** Writable data and help stream (defaults to `process.stdout`). */
  stdout?: TerminalOutputStream;

  /** Writable diagnostic and error stream (defaults to `process.stderr`). */
  stderr?: TerminalOutputStream;

  /** Environment map checked for `NO_COLOR`, `TERM`, and `CI`. */
  env?: Readonly<Record<string, string | undefined>>;

  /** Explicit TTY override for `stdout` color and terminal checks. */
  isStdoutTTY?: boolean;

  /** Explicit TTY override for `stderr` color and terminal checks. */
  isStderrTTY?: boolean;

  /** Pre-opened interactive terminal session for prompts and choice menus. */
  terminal?: TerminalSession;

  /** Lightweight prompt IO pair converted into a `TerminalSession`. */
  promptIo?: PromptIo;

  /** Explicit interactive override (`false` disables prompting). */
  interactive?: boolean;

  /** Custom controlling-terminal opener for deterministic testing. */
  openTty?: () => Promise<TerminalSession | undefined>;

  /** Semantic theme or palette overrides applied to this execution. */
  theme?: ThemeInput;

  /** Callback invoked when execution ends with a non-zero exit code. */
  onExitCode?: (exitCode: number) => void;

  /** Whether to set `process.exitCode` on non-zero exit. */
  setProcessExitCode?: boolean;
};

/** Public facade contract exposed by the `Acclimate` singleton module. */
export type AcclimateFacade = {
  /** Create a new Acclimate CLI instance. */
  createCli: (name: string) => IAcclimateCli;

  /**
   * Run a CLI against `options.args` (or `process.argv.slice(2)`), separating
   * `stdout` data from `stderr` diagnostics and resolving to the exit code
   * (`0` on success or help, `130` on cancellation, `1` on other failures)
   * without calling `process.exit()`.
   */
  run: (
    cli: AnyCli,
    options?: Readonly<AcclimateRunOptions>,
  ) => Promise<number>;

  /**
   * Execute a CLI in-process with injectable arguments, streams, environment,
   * TTY flags, prompt IO, and semantic theme, returning `Promise<number>`
   * without mutating `process.exitCode`.
   */
  execute: (
    cli: AnyCli,
    options?: Readonly<Omit<AcclimateRunOptions, "setProcessExitCode">>,
  ) => Promise<number>;

  /**
   * Active dark-terminal semantic theme bound to the current execution
   * context's `stderr` (or `process.stderr` outside a run), honoring TTY,
   * `NO_COLOR`, `TERM=dumb`, and `Acclimate.setTheme`.
   */
  theme: SemanticTheme;

  /**
   * Create a semantic theme merged on top of `Acclimate`'s configured palette
   * defaults and bound to the target stream and environment.
   */
  createTheme: (options?: Readonly<CreateThemeOptions>) => SemanticTheme;

  /** Configure default semantic palette overrides used by `Acclimate`. */
  setTheme: (palette: Readonly<SemanticThemePaletteOverrides>) => void;

  /** Reset `Acclimate`'s default semantic palette back to dark defaults. */
  resetTheme: () => void;

  /**
   * Write a formatted conversational or diagnostic message to `stderr`.
   * Supports `$varName$` interpolation, raw `|<COLOR>|`, and semantic
   * `|<ROLE>|` tokens, stripping color on non-TTY, `NO_COLOR`, or `TERM=dumb`.
   */
  log: (
    message: string,
    params?: Readonly<
      Record<string, string | boolean | number | null | undefined>
    >,
    options?: Readonly<AcclimateLogOptions>,
  ) => void;

  /** Write a semantic `success` line (`✅ ...`) to `stderr`. */
  printSuccess: (
    message: string,
    options?: Readonly<AcclimateStatusPrintOptions>,
  ) => void;

  /** Write a semantic `info` line (`ℹ️ ...`) to `stderr`. */
  printInfo: (
    message: string,
    options?: Readonly<AcclimateStatusPrintOptions>,
  ) => void;

  /** Write a semantic `warning` line (`⚠️ ...`) to `stderr`. */
  printWarn: (
    message: string,
    options?: Readonly<AcclimateStatusPrintOptions>,
  ) => void;

  /**
   * Write a semantic `error` line (`❌ ...`) to `stderr`, followed by an
   * indented `warning` recovery hint (`  ⚠️ ...`) when `options.hint` is given.
   */
  printError: (
    message: string,
    options?: Readonly<AcclimateErrorPrintOptions>,
  ) => void;

  /**
   * Write intentional machine-consumable text exclusively to `stdout` without
   * ANSI formatting or diagnostic chatter.
   */
  writeData: (
    data: string,
    options?: Readonly<{
      stream?: TerminalOutputStream;
      trailingNewline?: boolean;
    }>,
  ) => void;

  /**
   * Serialize a value as JSON and write it exclusively to `stdout` so piped
   * consumers (such as `jq` or scripts) receive clean structured output.
   */
  writeJson: (
    value: unknown,
    options?: Readonly<{
      stream?: TerminalOutputStream;
      pretty?: boolean;
    }>,
  ) => void;

  /**
   * Prompt the user for interactive input over the controlling terminal
   * (`/dev/tty`, injected `terminal`, or `promptIo`), delegating `choices` and
   * boolean prompts to choice menus and handling unattended fallback cleanly.
   */
  requestInput: (
    options: Readonly<RequestTerminalInputOptions>,
  ) => Promise<string | undefined>;

  /**
   * Present an interactive choice menu on the controlling terminal (`/dev/tty`,
   * injected `terminal`, or `promptIo`) supporting Up/Down and `j`/`k`
   * wrapping, `g`/`G` jumps, `Enter` confirm, and `Ctrl-C`/`EOF` cancellation.
   */
  requestChoice: <TValue extends string = string>(
    options: Readonly<ChoiceMenuOptions<TValue>>,
  ) => Promise<TValue>;
};
