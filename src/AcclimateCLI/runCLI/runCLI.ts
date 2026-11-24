import { generateHelpText } from "@/AcclimateCLI/generateHelpText/generateHelpText";
import { CLIError } from "@/CLIError";
import { requestChoiceMenu } from "@/requestChoiceMenu/requestChoiceMenu";
import { openTerminalSession } from "@/terminalSession/openTerminalSession/openTerminalSession";
import { attachCLIErrorHelpContext } from "./attachCLIErrorHelpContext";
import { parseTargetCLIArgs } from "./parseTargetCLIArgs";
import { mergeParentGlobalOptions } from "./tokenizeCLIInput/cliOptionLookupHelpers";
import { tokenizeCLIInput } from "./tokenizeCLIInput/tokenizeCLIInput";
import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
  CLIParamDataType,
  CLIPositionalParam,
} from "@/AcclimateCLI/AcclimateCLI.types";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";

/**
 * Options accepted by `runCLI` for executing a CLI against raw `argv` tokens.
 */
export type RunCLIOptions = {
  input: readonly string[];
  cli: AnyCLI;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  stdin?: TerminalInputStream;
  env?: Readonly<Record<string, string | undefined>>;
  terminal?: TerminalSession;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
};

type RuntimeTargetCLIState = {
  positionalArgs: readonly CLIPositionalParam[];
  optionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  globalOptionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  commands: Record<CLICommandName, AnyCLI>;
  action?: (args: Record<string, CLIParamDataType>) => void | Promise<void>;
};

type LazyTerminalController = {
  getSession: () => Promise<TerminalSession | undefined>;
  close: () => Promise<void>;
};

type TargetExecutionContext = {
  targetCLI: AnyCLI;
  commandPath: readonly string[];
  rawPositionalArgs: readonly string[];
  rawOptionArgs: Readonly<Record<CLIFullOptionName, string>>;
  rawGlobalOptionArgs: Readonly<Record<CLIFullOptionName, string>>;
};

function _createLazyTerminalController(options: {
  runOptions: Readonly<RunCLIOptions>;
  isNoPromptRequested: boolean;
}): LazyTerminalController {
  const { runOptions, isNoPromptRequested } = options;
  const effectiveInteractive =
    runOptions.interactive === false || isNoPromptRequested ?
      false
    : runOptions.interactive;

  let cachedSession: TerminalSession | undefined;
  let didAttemptOpen = false;

  return {
    getSession: async () => {
      if (!didAttemptOpen) {
        didAttemptOpen = true;
        cachedSession = await openTerminalSession({
          session: runOptions.terminal,
          interactive: effectiveInteractive,
          stdin: runOptions.stdin,
          stdout: runOptions.stdout,
          stderr: runOptions.stderr,
          env: runOptions.env,
          openTty: runOptions.openTty,
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
  commands: Readonly<Record<CLICommandName, AnyCLI>>,
): Array<{ value: string; label: string; description: string | undefined }> {
  return Object.entries(commands)
    .sort(([firstName], [secondName]) => {
      return firstName.localeCompare(secondName);
    })
    .map(([commandName, commandCLI]) => {
      return {
        value: commandName,
        label: commandName,
        description: commandCLI.state.description,
      };
    });
}

async function _selectBareSubcommand(options: {
  context: Readonly<TargetExecutionContext>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
}): Promise<TargetExecutionContext> {
  const { context, getTerminalSession } = options;
  const targetState = context.targetCLI.state as RuntimeTargetCLIState;
  const commandChoices = _getSortedCommandChoices(targetState.commands);
  const canOpenMenu =
    targetState.action === undefined &&
    commandChoices.length > 0 &&
    context.rawPositionalArgs.length === 0 &&
    Object.keys(context.rawOptionArgs).length === 0;
  if (!canOpenMenu) {
    return context;
  }

  const terminalSession = await getTerminalSession();
  if (!terminalSession) {
    return context;
  }

  const cliName = context.commandPath.join(" ");
  const chosenCommandName = await requestChoiceMenu({
    message: `Select a command for ${cliName}`,
    choices: commandChoices,
    terminal: terminalSession,
    cliName,
  });

  return _selectBareSubcommand({
    context: {
      targetCLI: mergeParentGlobalOptions({
        parentCLI: context.targetCLI,
        commandCLI: targetState.commands[chosenCommandName]!,
      }),
      commandPath: [...context.commandPath, chosenCommandName],
      rawPositionalArgs: [],
      rawOptionArgs: {},
      rawGlobalOptionArgs: context.rawGlobalOptionArgs,
    },
    getTerminalSession,
  });
}

async function _collectTargetExecution(options: {
  initialContext: Readonly<TargetExecutionContext>;
  terminalController: Readonly<LazyTerminalController>;
}): Promise<{
  finalContext: TargetExecutionContext;
  parsedArgs: Record<string, CLIParamDataType>;
}> {
  const { terminalController } = options;
  let finalContext: TargetExecutionContext = options.initialContext;

  try {
    finalContext = await _selectBareSubcommand({
      context: options.initialContext,
      getTerminalSession: terminalController.getSession,
    });
    const targetState = finalContext.targetCLI.state as RuntimeTargetCLIState;
    const parsedArgs = await parseTargetCLIArgs({
      cliName: finalContext.commandPath.join(" "),
      positionalArgs: targetState.positionalArgs,
      optionArgs: targetState.optionArgs,
      globalOptionArgs: targetState.globalOptionArgs,
      rawPositionalArgs: finalContext.rawPositionalArgs,
      rawOptionArgs: finalContext.rawOptionArgs,
      rawGlobalOptionArgs: finalContext.rawGlobalOptionArgs,
      getTerminalSession: terminalController.getSession,
    });
    return { finalContext, parsedArgs };
  } catch (error: unknown) {
    if (error instanceof CLIError && error.usage === undefined) {
      throw attachCLIErrorHelpContext({
        cli: finalContext.targetCLI,
        commandPath: finalContext.commandPath,
        error,
      });
    }
    throw error;
  } finally {
    await terminalController.close();
  }
}

/**
 * Runs a CLI against raw `argv` tokens, writing built-in `-h`/`--help` or
 * unattended actionless usage to `stdout`, driving interactive choice menus
 * and prompts on `/dev/tty`, and awaiting the matched command's action.
 *
 * Called by `executeCLI` for process-boundary execution and by programmatic
 * callers that want structured `CLIError` rejections.
 */
export async function runCLI(options: Readonly<RunCLIOptions>): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const tokenized = tokenizeCLIInput({
    cli: options.cli,
    input: options.input,
  });

  if (tokenized.isHelpRequested) {
    stdout.write(
      `${generateHelpText(tokenized.targetCLI, { commandPath: tokenized.commandPath })}\n`,
    );
    return;
  }

  const terminalController = _createLazyTerminalController({
    runOptions: options,
    isNoPromptRequested: tokenized.isNoPromptRequested,
  });
  const { finalContext, parsedArgs } = await _collectTargetExecution({
    initialContext: tokenized,
    terminalController,
  });

  const matchedState = finalContext.targetCLI.state as RuntimeTargetCLIState;
  if (matchedState.action) {
    await matchedState.action(parsedArgs);
    return;
  }

  stdout.write(
    `${generateHelpText(finalContext.targetCLI, { commandPath: finalContext.commandPath })}\n`,
  );
}
