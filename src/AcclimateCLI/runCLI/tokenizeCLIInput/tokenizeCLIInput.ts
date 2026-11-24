import { CLIError } from "@/CLIError";
import { attachCLIErrorHelpContext } from "../attachCLIErrorHelpContext";
import {
  findOptionEntry,
  getScanCLIState,
  isBuiltinHelpFlag,
  isNegativeNumberToken,
  isOptionLikeToken,
  mergeParentGlobalOptions,
  splitInlineOptionToken,
} from "./cliOptionLookupHelpers";
import type { OptionLookupEntry } from "./cliOptionLookupHelpers";
import type {
  AnyCLI,
  CLIFullOptionName,
} from "@/AcclimateCLI/AcclimateCLI.types";
import type { SemanticTheme } from "@/theme/theme.types";

type TokenizeCLIInputOptions = {
  cli: AnyCLI;
  input: readonly string[];
  commandPath?: readonly string[];
  inheritedGlobalOptionArgs?: Readonly<Record<CLIFullOptionName, string>>;
  inheritedNoPrompt?: boolean;
  errorTheme?: SemanticTheme;
};

/** Result of tokenizing raw CLI argv tokens against a command hierarchy. */
export type TokenizedCLIInput = {
  targetCLI: AnyCLI;
  commandPath: string[];
  isHelpRequested: boolean;
  isNoPromptRequested: boolean;
  rawPositionalArgs: string[];
  rawOptionArgs: Record<CLIFullOptionName, string>;
  rawGlobalOptionArgs: Record<CLIFullOptionName, string>;
};

type TokenScanState = {
  isAfterDoubleDash: boolean;
  isHelpRequested: boolean;
  isNoPromptRequested: boolean;
  pendingOption: OptionLookupEntry | undefined;
  scanError: CLIError | undefined;
  rawPositionalArgs: string[];
  rawOptionArgs: Record<CLIFullOptionName, string>;
  rawGlobalOptionArgs: Record<CLIFullOptionName, string>;
  delegatedResult: TokenizedCLIInput | undefined;
};

type StepTokenOptions = {
  cli: AnyCLI;
  commandPath: readonly string[];
  state: Readonly<TokenScanState>;
  token: string;
  remainingTokens: readonly string[];
  errorTheme?: SemanticTheme;
};

function _recordOptionValue(options: {
  state: Readonly<TokenScanState>;
  entry: Readonly<OptionLookupEntry>;
  rawValue: string;
}): TokenScanState {
  const { state, entry, rawValue } = options;
  const nextNoPrompt =
    entry.canonicalName === "--no-prompt" ?
      rawValue !== "false"
    : state.isNoPromptRequested;

  if (entry.isGlobal) {
    return {
      ...state,
      isNoPromptRequested: nextNoPrompt,
      pendingOption: undefined,
      rawGlobalOptionArgs: {
        ...state.rawGlobalOptionArgs,
        [entry.canonicalName]: rawValue,
      },
    };
  }

  return {
    ...state,
    isNoPromptRequested: nextNoPrompt,
    pendingOption: undefined,
    rawOptionArgs: {
      ...state.rawOptionArgs,
      [entry.canonicalName]: rawValue,
    },
  };
}

function _consumePendingOptionToken(
  options: Readonly<Omit<StepTokenOptions, "remainingTokens">>,
): TokenScanState {
  const { cli, commandPath, state, token, errorTheme } = options;
  const pendingOption = state.pendingOption!;
  if (isBuiltinHelpFlag({ cli, token })) {
    return { ...state, pendingOption: undefined, isHelpRequested: true };
  }

  const isDoubleDash = token === "--";
  const isRegisteredFlag =
    isOptionLikeToken(token) &&
    findOptionEntry({
      cli,
      rawFlag: splitInlineOptionToken(token).rawFlag,
    }) !== undefined;
  const isUnregisteredFlag =
    isOptionLikeToken(token) && !isNegativeNumberToken(token);

  if (isDoubleDash || isRegisteredFlag || isUnregisteredFlag) {
    const missingError = attachCLIErrorHelpContext({
      cli,
      commandPath,
      error: CLIError.missingOptionValue({
        cliName: commandPath.join(" "),
        optionName: pendingOption.canonicalName,
      }),
      theme: errorTheme,
    });
    return {
      ...state,
      pendingOption: undefined,
      isAfterDoubleDash: state.isAfterDoubleDash || isDoubleDash,
      scanError: state.scanError ?? missingError,
    };
  }

  return _recordOptionValue({
    state,
    entry: pendingOption,
    rawValue: token,
  });
}

function _consumeFlagToken(
  options: Readonly<Omit<StepTokenOptions, "remainingTokens">>,
): TokenScanState {
  const { cli, commandPath, state, token, errorTheme } = options;
  if (isBuiltinHelpFlag({ cli, token })) {
    return { ...state, isHelpRequested: true };
  }

  const { rawFlag, inlineValue } = splitInlineOptionToken(token);
  const entry = findOptionEntry({ cli, rawFlag });

  if (!entry) {
    if (rawFlag === "--no-prompt") {
      return { ...state, isNoPromptRequested: inlineValue !== "false" };
    }
    if (inlineValue === undefined && isNegativeNumberToken(token)) {
      return {
        ...state,
        rawPositionalArgs: [...state.rawPositionalArgs, token],
      };
    }
    const unknownError = attachCLIErrorHelpContext({
      cli,
      commandPath,
      error: CLIError.unknownOption({
        cliName: commandPath.join(" "),
        optionName: rawFlag,
      }),
      theme: errorTheme,
    });
    return { ...state, scanError: state.scanError ?? unknownError };
  }

  if (inlineValue !== undefined) {
    return _recordOptionValue({ state, entry, rawValue: inlineValue });
  }

  if (entry.config.type === "boolean") {
    return _recordOptionValue({ state, entry, rawValue: "" });
  }

  return { ...state, pendingOption: entry };
}

function _consumePositionalOrCommandToken(
  options: Readonly<StepTokenOptions>,
): TokenScanState {
  const { cli, commandPath, state, token, remainingTokens, errorTheme } =
    options;
  const { commands } = getScanCLIState(cli);
  const canMatchSubcommand =
    !state.isAfterDoubleDash &&
    state.scanError === undefined &&
    state.rawPositionalArgs.length === 0 &&
    Object.keys(state.rawOptionArgs).length === 0;
  const matchedCommandCLI = canMatchSubcommand ? commands[token] : undefined;

  if (matchedCommandCLI) {
    const commandCLI = mergeParentGlobalOptions({
      parentCLI: cli,
      commandCLI: matchedCommandCLI,
    });
    return {
      ...state,
      delegatedResult: tokenizeCLIInput({
        cli: commandCLI,
        input: remainingTokens,
        commandPath: [...commandPath, token],
        inheritedGlobalOptionArgs: state.rawGlobalOptionArgs,
        inheritedNoPrompt: state.isNoPromptRequested,
        errorTheme,
      }),
    };
  }

  return {
    ...state,
    rawPositionalArgs: [...state.rawPositionalArgs, token],
  };
}

function _stepToken(options: Readonly<StepTokenOptions>): TokenScanState {
  const { cli, commandPath, state, token, remainingTokens, errorTheme } =
    options;
  if (state.delegatedResult || state.isHelpRequested) {
    return state;
  }
  if (state.pendingOption) {
    return _consumePendingOptionToken({
      cli,
      commandPath,
      state,
      token,
      errorTheme,
    });
  }
  if (state.isAfterDoubleDash) {
    return {
      ...state,
      rawPositionalArgs: [...state.rawPositionalArgs, token],
    };
  }
  if (token === "--") {
    return { ...state, isAfterDoubleDash: true };
  }
  if (isOptionLikeToken(token)) {
    return _consumeFlagToken({ cli, commandPath, state, token, errorTheme });
  }
  return _consumePositionalOrCommandToken({
    cli,
    commandPath,
    state,
    token,
    remainingTokens,
    errorTheme,
  });
}

function _finalizeTokenScan(options: {
  cli: AnyCLI;
  commandPath: readonly string[];
  finalState: Readonly<TokenScanState>;
  errorTheme?: SemanticTheme;
}): TokenizedCLIInput {
  const { cli, commandPath, finalState, errorTheme } = options;
  if (finalState.delegatedResult) {
    return finalState.delegatedResult;
  }

  if (!finalState.isHelpRequested) {
    if (finalState.scanError) {
      throw finalState.scanError;
    }
    if (finalState.pendingOption) {
      throw attachCLIErrorHelpContext({
        cli,
        commandPath,
        error: CLIError.missingOptionValue({
          cliName: commandPath.join(" "),
          optionName: finalState.pendingOption.canonicalName,
        }),
        theme: errorTheme,
      });
    }
  }

  return {
    targetCLI: cli,
    commandPath: [...commandPath],
    isHelpRequested: finalState.isHelpRequested,
    isNoPromptRequested: finalState.isNoPromptRequested,
    rawPositionalArgs: finalState.rawPositionalArgs,
    rawOptionArgs: finalState.rawOptionArgs,
    rawGlobalOptionArgs: finalState.rawGlobalOptionArgs,
  };
}

/**
 * Tokenizes raw CLI arguments against a command tree into positional tokens,
 * canonical local and global options, built-in `-h`/`--help` and `--no-prompt`
 * flags, and the matched target command CLI with its full invocation path.
 *
 * Called by `runCLI` before argument allocation, prompting, and validation.
 */
export function tokenizeCLIInput(
  options: Readonly<TokenizeCLIInputOptions>,
): TokenizedCLIInput {
  const {
    cli,
    input,
    commandPath = [cli.getName()],
    inheritedGlobalOptionArgs = {},
    inheritedNoPrompt = false,
    errorTheme,
  } = options;
  const initialState: TokenScanState = {
    isAfterDoubleDash: false,
    isHelpRequested: false,
    isNoPromptRequested: inheritedNoPrompt,
    pendingOption: undefined,
    scanError: undefined,
    rawPositionalArgs: [],
    rawOptionArgs: {},
    rawGlobalOptionArgs: { ...inheritedGlobalOptionArgs },
    delegatedResult: undefined,
  };

  const finalState = input.reduce((state, token, idx) => {
    return _stepToken({
      cli,
      commandPath,
      state,
      token,
      remainingTokens: input.slice(idx + 1),
      errorTheme,
    });
  }, initialState);

  return _finalizeTokenScan({ cli, commandPath, finalState, errorTheme });
}
