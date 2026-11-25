import { ExecutionIoContext } from "@/AcclimateCli/ExecutionIoContext/ExecutionIoContext";
import { generateHelpText } from "@/AcclimateCli/generateHelpText/generateHelpText";
import { CliError } from "@/CliError";
import { requestChoiceMenu } from "@/requestChoiceMenu/requestChoiceMenu";
import { makeTerminalSessionFromPromptIo } from "@/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo";
import { openTerminalSession } from "@/terminalSession/openTerminalSession/openTerminalSession";
import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import { attachCliErrorHelpContext } from "./attachCliErrorHelpContext";
import { parseTargetCliArgs } from "./parseTargetCliArgs";
import { mergeParentGlobalOptions } from "./tokenizeCliInput/cliOptionLookupHelpers";
import { tokenizeCliInput } from "./tokenizeCliInput/tokenizeCliInput";
import type {
  AnyCli,
  CliCommandName,
  CliFullOptionName,
  CliOptionParam,
  CliParamDataType,
  CliPositionalParam,
} from "@/AcclimateCli/AcclimateCli.types";
import type { ExecutionIoStore } from "@/AcclimateCli/ExecutionIoContext/ExecutionIoContext";
import type {
  PromptIo,
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { SemanticTheme, ThemeInput } from "@/theme/theme.types";

/**
 * Options accepted by `runCli` for executing a CLI against raw `argv` tokens.
 */
export type RunCliOptions = {
  input: readonly string[];
  cli: AnyCli;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  stdin?: TerminalInputStream;
  env?: Readonly<Record<string, string | undefined>>;
  isStdoutTTY?: boolean;
  isStderrTTY?: boolean;
  terminal?: TerminalSession;
  promptIo?: PromptIo;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
  theme?: ThemeInput;
};

type RuntimeTargetCliState = {
  positionalArgs: readonly CliPositionalParam[];
  optionArgs: Record<CliFullOptionName, CliOptionParam>;
  globalOptionArgs: Record<CliFullOptionName, CliOptionParam>;
  commands: Record<CliCommandName, AnyCli>;
  action?: (args: Record<string, CliParamDataType>) => void | Promise<void>;
};

type LazyTerminalController = {
  getSession: () => Promise<TerminalSession | undefined>;
  close: () => Promise<void>;
};

type TargetExecutionContext = {
  targetCli: AnyCli;
  commandPath: readonly string[];
  rawPositionalArgs: readonly string[];
  rawOptionArgs: Readonly<Record<CliFullOptionName, string>>;
  rawGlobalOptionArgs: Readonly<Record<CliFullOptionName, string>>;
};

function _withTtyOverride(
  stream: TerminalOutputStream,
  isTty: boolean | undefined,
): TerminalOutputStream {
  if (isTty === undefined) {
    return stream;
  }
  return {
    write: (chunk: string) => {
      return stream.write(chunk);
    },
    isTTY: isTty,
  };
}

function _buildExecutionStore(
  options: Readonly<RunCliOptions>,
): ExecutionIoStore {
  const env = options.env ?? process.env;
  const stdin = options.stdin ?? process.stdin;
  const stdout = _withTtyOverride(
    options.stdout ?? process.stdout,
    options.isStdoutTTY,
  );
  const stderr = _withTtyOverride(
    options.stderr ?? process.stderr,
    options.isStderrTTY,
  );
  const terminal =
    options.terminal ??
    (options.promptIo ?
      makeTerminalSessionFromPromptIo({ promptIo: options.promptIo, env })
    : undefined);

  return {
    stdin,
    stdout,
    stderr,
    env,
    stdoutTheme: makeThemeFromOptions({
      theme: options.theme,
      stream: stdout,
      env,
    }),
    stderrTheme: makeThemeFromOptions({
      theme: options.theme,
      stream: stderr,
      env,
    }),
    terminal,
    interactive: options.interactive,
    openTty: options.openTty,
  };
}

function _createLazyTerminalController(options: {
  store: Readonly<ExecutionIoStore>;
  isNoPromptRequested: boolean;
}): LazyTerminalController {
  const { store, isNoPromptRequested } = options;
  const effectiveInteractive =
    store.interactive === false || isNoPromptRequested ?
      false
    : store.interactive;

  let cachedSession: TerminalSession | undefined;
  let didAttemptOpen = false;

  return {
    getSession: async () => {
      if (!didAttemptOpen) {
        didAttemptOpen = true;
        cachedSession = await openTerminalSession({
          session: store.terminal,
          interactive: effectiveInteractive,
          stdin: store.stdin,
          stdout: store.stdout,
          stderr: store.stderr,
          env: store.env,
          openTty: store.openTty,
        });
      }
      return cachedSession;
    },
    close: async () => {
      if (cachedSession) {
        const sessionToClose = cachedSession;
        cachedSession = undefined;
        await sessionToClose.close();
      }
    },
  };
}

function _getSortedCommandChoices(
  commands: Readonly<Record<CliCommandName, AnyCli>>,
): Array<{ value: string; label: string; description: string | undefined }> {
  return Object.entries(commands)
    .sort(([firstName], [secondName]) => {
      return firstName.localeCompare(secondName);
    })
    .map(([commandName, commandCli]) => {
      return {
        value: commandName,
        label: commandName,
        description: commandCli.state.description,
      };
    });
}

async function _selectBareSubcommand(options: {
  context: Readonly<TargetExecutionContext>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme: SemanticTheme;
}): Promise<TargetExecutionContext> {
  const { context, getTerminalSession, theme } = options;
  const targetState = context.targetCli.state as RuntimeTargetCliState;
  const commandChoices = _getSortedCommandChoices(targetState.commands);
  const canOpenMenu =
    targetState.action === undefined &&
    commandChoices.length > 0 &&
    context.rawPositionalArgs.length === 0 &&
    Object.keys(context.rawOptionArgs).length === 0;
  const terminalSession = canOpenMenu ? await getTerminalSession() : undefined;
  if (!terminalSession) {
    return context;
  }

  const cliName = context.commandPath.join(" ");
  const chosenCommandName = await requestChoiceMenu({
    message: `Select a command for ${cliName}`,
    choices: commandChoices,
    terminal: terminalSession,
    cliName,
    theme,
  });
  const targetCli = mergeParentGlobalOptions({
    parentCli: context.targetCli,
    commandCli: targetState.commands[chosenCommandName]!,
  });
  return _selectBareSubcommand({
    context: {
      targetCli,
      commandPath: [...context.commandPath, chosenCommandName],
      rawPositionalArgs: [],
      rawOptionArgs: {},
      rawGlobalOptionArgs: context.rawGlobalOptionArgs,
    },
    getTerminalSession,
    theme,
  });
}

async function _collectTargetExecution(options: {
  initialContext: Readonly<TargetExecutionContext>;
  terminalController: Readonly<LazyTerminalController>;
  stderrTheme: SemanticTheme;
}): Promise<{
  finalContext: TargetExecutionContext;
  parsedArgs: Record<string, CliParamDataType>;
}> {
  const { terminalController, stderrTheme } = options;
  let finalContext: TargetExecutionContext = options.initialContext;

  try {
    finalContext = await _selectBareSubcommand({
      context: options.initialContext,
      getTerminalSession: terminalController.getSession,
      theme: stderrTheme,
    });
    const targetState = finalContext.targetCli.state as RuntimeTargetCliState;
    const parsedArgs = await parseTargetCliArgs({
      cliName: finalContext.commandPath.join(" "),
      positionalArgs: targetState.positionalArgs,
      optionArgs: targetState.optionArgs,
      globalOptionArgs: targetState.globalOptionArgs,
      rawPositionalArgs: finalContext.rawPositionalArgs,
      rawOptionArgs: finalContext.rawOptionArgs,
      rawGlobalOptionArgs: finalContext.rawGlobalOptionArgs,
      getTerminalSession: terminalController.getSession,
      theme: stderrTheme,
    });
    return { finalContext, parsedArgs };
  } catch (error: unknown) {
    if (error instanceof CliError && error.usage === undefined) {
      throw attachCliErrorHelpContext({
        cli: finalContext.targetCli,
        commandPath: finalContext.commandPath,
        error,
        theme: stderrTheme,
      });
    }
    throw error;
  } finally {
    await terminalController.close();
  }
}

/**
 * Runs a CLI against raw `argv` tokens inside an async-scoped IO context,
 * writing themed or plain-mode help to `stdout`, driving interactive choice
 * menus and prompts on `/dev/tty`, and awaiting the matched command's action.
 *
 * Called by `executeCli` for process-boundary execution and by programmatic
 * callers that want structured `CliError` rejections.
 */
export async function runCli(options: Readonly<RunCliOptions>): Promise<void> {
  const store = _buildExecutionStore(options);

  await ExecutionIoContext.run(store, async () => {
    const tokenized = tokenizeCliInput({
      cli: options.cli,
      input: options.input,
      errorTheme: store.stderrTheme,
    });

    if (tokenized.isHelpRequested) {
      store.stdout.write(
        `${generateHelpText(tokenized.targetCli, {
          commandPath: tokenized.commandPath,
          theme: store.stdoutTheme,
        })}\n`,
      );
      return;
    }

    const terminalController = _createLazyTerminalController({
      store,
      isNoPromptRequested: tokenized.isNoPromptRequested,
    });
    const { finalContext, parsedArgs } = await _collectTargetExecution({
      initialContext: tokenized,
      terminalController,
      stderrTheme: store.stderrTheme,
    });

    const matchedState = finalContext.targetCli.state as RuntimeTargetCliState;
    if (matchedState.action) {
      await matchedState.action(parsedArgs);
      return;
    }

    store.stdout.write(
      `${generateHelpText(finalContext.targetCli, {
        commandPath: finalContext.commandPath,
        theme: store.stdoutTheme,
      })}\n`,
    );
  });
}
