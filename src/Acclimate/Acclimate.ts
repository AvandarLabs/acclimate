import { createCli } from "@/AcclimateCli";
import { executeCli } from "@/AcclimateCli/executeCli/executeCli";
import { ExecutionIoContext } from "@/AcclimateCli/ExecutionIoContext/ExecutionIoContext";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { requestChoiceMenu } from "@/requestChoiceMenu/requestChoiceMenu";
import { requestTerminalInput } from "@/requestTerminalInput";
import { createTheme } from "@/theme/createTheme/createTheme";
import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import type {
  AcclimateFacade,
  AcclimateLogOptions,
  AcclimateRunOptions,
  AcclimateStatusPrintOptions,
} from "./Acclimate.types";
import type { AnyCli } from "@/AcclimateCli/AcclimateCli.types";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";
import type {
  SemanticTheme,
  SemanticThemePaletteOverrides,
  ThemeInput,
} from "@/theme/theme.types";

let defaultPaletteOverrides: SemanticThemePaletteOverrides | undefined;

function _hasInjectedExecutionBoundary(
  options: Readonly<AcclimateRunOptions> | undefined,
): boolean {
  if (!options) {
    return false;
  }
  return (
    options.args !== undefined ||
    options.stdin !== undefined ||
    options.stdout !== undefined ||
    options.stderr !== undefined ||
    options.env !== undefined ||
    options.isStdoutTTY !== undefined ||
    options.isStderrTTY !== undefined ||
    options.terminal !== undefined ||
    options.promptIo !== undefined ||
    options.openTty !== undefined
  );
}

function _getEffectiveStderrTheme(
  options: Readonly<AcclimateStatusPrintOptions> = {},
): { stream: TerminalOutputStream; theme: SemanticTheme } {
  const store = ExecutionIoContext.get();
  const stream = options.stream ?? store?.stderr ?? process.stderr;
  const env = options.env ?? store?.env ?? process.env;
  const baseTheme =
    options.theme ?? store?.stderrTheme ?? defaultPaletteOverrides;
  const theme = makeThemeFromOptions({
    theme: baseTheme,
    fallbackPalette: defaultPaletteOverrides,
    color: options.color,
    stream,
    isTTY: options.isTTY,
    env,
  });
  return { stream, theme };
}

function _prefixWithEmoji(emoji: string, message: string): string {
  return message.startsWith(emoji) ? message : `${emoji} ${message}`;
}

function _buildRunThemeInput(
  themeInput: ThemeInput | undefined,
): ThemeInput | undefined {
  if (themeInput === undefined) {
    return defaultPaletteOverrides;
  }
  if (
    "isColorEnabled" in themeInput &&
    typeof themeInput.style === "function"
  ) {
    return themeInput;
  }
  return defaultPaletteOverrides ?
      { ...defaultPaletteOverrides, ...themeInput }
    : themeInput;
}

/**
 * Primary public facade for creating, running, theming, logging, writing
 * structured data, and prompting interactively in `@avandar/acclimate` CLIs.
 */
export const Acclimate: AcclimateFacade = {
  createCli,
  run: (cli: AnyCli, options?: Readonly<AcclimateRunOptions>) => {
    const shouldSetProcessExitCode =
      options?.setProcessExitCode ??
      (options?.onExitCode === undefined &&
        !_hasInjectedExecutionBoundary(options));

    return executeCli({
      cli,
      args: options?.args ?? process.argv.slice(2),
      stdin: options?.stdin ?? process.stdin,
      stdout: options?.stdout ?? process.stdout,
      stderr: options?.stderr ?? process.stderr,
      env: options?.env ?? process.env,
      isStdoutTTY: options?.isStdoutTTY,
      isStderrTTY: options?.isStderrTTY,
      terminal: options?.terminal,
      promptIo: options?.promptIo,
      interactive: options?.interactive,
      openTty: options?.openTty,
      theme: _buildRunThemeInput(options?.theme),
      onExitCode:
        options?.onExitCode ??
        (shouldSetProcessExitCode ?
          (exitCode) => {
            process.exitCode = exitCode;
          }
        : undefined),
    });
  },
  execute: (cli: AnyCli, options = {}) => {
    return Acclimate.run(cli, {
      ...options,
      setProcessExitCode: false,
    });
  },
  get theme(): SemanticTheme {
    const store = ExecutionIoContext.get();
    if (store) {
      return store.stderrTheme;
    }
    return createTheme({
      stream: process.stderr,
      env: process.env,
      palette: defaultPaletteOverrides,
    });
  },
  createTheme: (options = {}) => {
    const mergedPalette =
      defaultPaletteOverrides || options.palette ?
        { ...defaultPaletteOverrides, ...options.palette }
      : undefined;
    return createTheme({
      ...options,
      palette: mergedPalette,
    });
  },
  setTheme: (palette) => {
    defaultPaletteOverrides = { ...palette };
  },
  resetTheme: () => {
    defaultPaletteOverrides = undefined;
  },
  log: (
    message: string,
    params: Readonly<
      Record<string, string | boolean | number | null | undefined>
    > = {},
    options: Readonly<AcclimateLogOptions> = {},
  ) => {
    const { stream, theme } = _getEffectiveStderrTheme(options);
    stream.write(`${generateTerminalMessage(message, params, { theme })}\n`);
  },
  printSuccess: (message: string, options = {}) => {
    const { stream, theme } = _getEffectiveStderrTheme(options);
    stream.write(`${theme.success(_prefixWithEmoji("✅", message))}\n`);
  },
  printInfo: (message: string, options = {}) => {
    const { stream, theme } = _getEffectiveStderrTheme(options);
    stream.write(`${theme.info(_prefixWithEmoji("ℹ️", message))}\n`);
  },
  printWarn: (message: string, options = {}) => {
    const { stream, theme } = _getEffectiveStderrTheme(options);
    stream.write(`${theme.warning(_prefixWithEmoji("⚠️", message))}\n`);
  },
  printError: (message: string, options = {}) => {
    const { stream, theme } = _getEffectiveStderrTheme(options);
    const errorLine = theme.error(_prefixWithEmoji("❌", message));
    const hintLine =
      options.hint !== undefined ?
        `\n  ${theme.warning(_prefixWithEmoji("⚠️", options.hint))}`
      : "";
    stream.write(`${errorLine}${hintLine}\n`);
  },
  writeData: (data: string, options = {}) => {
    const stream =
      options.stream ?? ExecutionIoContext.get()?.stdout ?? process.stdout;
    const suffix = options.trailingNewline === false ? "" : "\n";
    stream.write(`${data}${suffix}`);
  },
  writeJson: (value: unknown, options = {}) => {
    const stream =
      options.stream ?? ExecutionIoContext.get()?.stdout ?? process.stdout;
    const serialized = JSON.stringify(
      value,
      undefined,
      options.pretty ? 2 : undefined,
    );
    stream.write(`${serialized}\n`);
  },
  requestInput: (options) => {
    const store = ExecutionIoContext.get();
    return requestTerminalInput({
      stdin: store?.stdin,
      stdout: store?.stdout,
      stderr: store?.stderr,
      env: store?.env,
      interactive: store?.interactive,
      openTty: store?.openTty,
      theme: store?.stderrTheme ?? defaultPaletteOverrides,
      ...options,
      terminal:
        options.promptIo ?
          options.terminal
        : (options.terminal ?? store?.terminal),
    });
  },
  requestChoice: (options) => {
    const store = ExecutionIoContext.get();
    return requestChoiceMenu({
      stdin: store?.stdin,
      stdout: store?.stdout,
      stderr: store?.stderr,
      env: store?.env,
      interactive: store?.interactive,
      openTty: store?.openTty,
      theme: store?.stderrTheme ?? defaultPaletteOverrides,
      ...options,
      terminal:
        options.promptIo ?
          options.terminal
        : (options.terminal ?? store?.terminal),
    });
  },
};
