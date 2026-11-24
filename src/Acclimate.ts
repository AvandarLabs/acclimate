import { createCLI } from "./AcclimateCLI";
import { executeCLI } from "./AcclimateCLI/executeCLI/executeCLI";
import { generateTerminalMessage } from "./generateTerminalMessage";
import { requestChoiceMenu } from "./requestChoiceMenu/requestChoiceMenu";
import { requestTerminalInput } from "./requestTerminalInput";
import { isColorEnabledForStream } from "./terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import type { AnyCLI, IAcclimateCLI } from "./AcclimateCLI/AcclimateCLI.types";
import type { ChoiceMenuOptions } from "./requestChoiceMenu/requestChoiceMenu.types";
import type { RequestTerminalInputOptions } from "./requestTerminalInput/requestTerminalInput";
import type { TerminalOutputStream } from "./terminalSession/terminalSession.types";

type AcclimateLogOptions = {
  stream?: TerminalOutputStream;
  color?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};

type Acclimate = {
  /**
   * Create a new Acclimate CLI instance.
   *
   * @param name - The name of the CLI.
   * @returns A new CLI instance.
   */
  createCLI: (name: string) => IAcclimateCLI;

  /**
   * Run a CLI instance against `process.argv.slice(2)`, separating `stdout`
   * data from `stderr` diagnostics and setting `process.exitCode` on failure.
   *
   * @param cli - The CLI instance to run.
   */
  run: (cli: AnyCLI) => void;

  /**
   * Write a formatted conversational or diagnostic message to `stderr`
   * (keeping `stdout` clean for machine-consumable data). Supports `$varName$`
   * interpolation and `|<COLOR>|` tokens, automatically stripping color on
   * redirected streams, nonempty `NO_COLOR`, or `TERM=dumb`.
   */
  log: (
    message: string,
    params?: Readonly<
      Record<string, string | boolean | number | null | undefined>
    >,
    options?: Readonly<AcclimateLogOptions>,
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
   * (`/dev/tty`), delegating `choices` and boolean prompts to choice menus and
   * handling unattended fallback cleanly.
   */
  requestInput: (
    options: Readonly<RequestTerminalInputOptions>,
  ) => Promise<string | undefined>;

  /**
   * Present an interactive choice menu on the controlling terminal (`/dev/tty`)
   * supporting Up/Down and `j`/`k` wrapping, `g`/`G` jumps, `Enter` confirm,
   * and `Ctrl-C`/`EOF` cancellation.
   */
  requestChoice: <TValue extends string = string>(
    options: Readonly<ChoiceMenuOptions<TValue>>,
  ) => Promise<TValue>;
};

/**
 * Primary public facade for creating, running, logging, writing structured
 * data, and prompting interactively in `@avandar/acclimate` CLIs.
 */
export const Acclimate: Acclimate = {
  createCLI,
  run: (cli: AnyCLI) => {
    void executeCLI({
      cli,
      input: process.argv.slice(2),
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      env: process.env,
      onExitCode: (exitCode) => {
        process.exitCode = exitCode;
      },
    });
  },
  log: (
    message: string,
    params: Readonly<
      Record<string, string | boolean | number | null | undefined>
    > = {},
    options: Readonly<AcclimateLogOptions> = {},
  ) => {
    const stream = options.stream ?? process.stderr;
    const isColorEnabled =
      options.color ?? isColorEnabledForStream({ stream, env: options.env });
    stream.write(
      `${generateTerminalMessage(message, params, { color: isColorEnabled })}\n`,
    );
  },
  writeData: (data: string, options = {}) => {
    const stream = options.stream ?? process.stdout;
    const suffix = options.trailingNewline === false ? "" : "\n";
    stream.write(`${data}${suffix}`);
  },
  writeJson: (value: unknown, options = {}) => {
    const stream = options.stream ?? process.stdout;
    const serialized = JSON.stringify(
      value,
      undefined,
      options.pretty ? 2 : undefined,
    );
    stream.write(`${serialized}\n`);
  },
  requestInput: (options) => {
    return requestTerminalInput(options);
  },
  requestChoice: (options) => {
    return requestChoiceMenu(options);
  },
};
