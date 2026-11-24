import { CLIError } from "@/CLIError";
import { attachCLIErrorHelpContext } from "../attachCLIErrorHelpContext";
import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
} from "@/AcclimateCLI/AcclimateCLI.types";

const NEGATIVE_NUMBER_PATTERN = /^-(\d+(\.\d+)?|\.\d+)$/;

type TokenizeCLIInputOptions = {
  cli: AnyCLI;
  input: readonly string[];
  commandPath?: readonly string[];
  inheritedGlobalOptionArgs?: Readonly<Record<CLIFullOptionName, string>>;
};

/** Result of tokenizing raw CLI argv tokens against a command hierarchy. */
export type TokenizedCLIInput = {
  targetCLI: AnyCLI;
  commandPath: string[];
  isHelpRequested: boolean;
  rawPositionalArgs: string[];
  rawOptionArgs: Record<CLIFullOptionName, string>;
  rawGlobalOptionArgs: Record<CLIFullOptionName, string>;
};

type OptionLookupEntry = {
  canonicalName: CLIFullOptionName;
  config: CLIOptionParam;
  isGlobal: boolean;
};

type TokenScanState = {
  isAfterDoubleDash: boolean;
  isHelpRequested: boolean;
  pendingOption: OptionLookupEntry | undefined;
  scanError: CLIError | undefined;
  rawPositionalArgs: string[];
  rawOptionArgs: Record<CLIFullOptionName, string>;
  rawGlobalOptionArgs: Record<CLIFullOptionName, string>;
  delegatedResult: TokenizedCLIInput | undefined;
};

type RuntimeScanCLIState = {
  aliases: Record<string, CLIFullOptionName>;
  commands: Record<CLICommandName, AnyCLI>;
  optionArgs: Record<string, CLIOptionParam>;
  globalOptionArgs: Record<string, CLIOptionParam>;
};

type StepTokenOptions = {
  cli: AnyCLI;
  commandPath: readonly string[];
  state: Readonly<TokenScanState>;
  token: string;
  remainingTokens: readonly string[];
};

function _getScanCLIState(cli: AnyCLI): RuntimeScanCLIState {
  // AnyCLI erases builder generics; narrow once at the tokenizer boundary.
  return cli.state as RuntimeScanCLIState;
}

function _isOptionLikeToken(token: string): boolean {
  return token.length > 1 && token.startsWith("-");
}

function _isNegativeNumberToken(token: string): boolean {
  return NEGATIVE_NUMBER_PATTERN.test(token);
}

function _splitInlineOptionToken(token: string): {
  rawFlag: string;
  inlineValue: string | undefined;
} {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return { rawFlag: token, inlineValue: undefined };
  }
  return {
    rawFlag: token.slice(0, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1),
  };
}

function _findOptionEntry(options: {
  cli: AnyCLI;
  rawFlag: string;
}): OptionLookupEntry | undefined {
  const { aliases, globalOptionArgs, optionArgs } = _getScanCLIState(
    options.cli,
  );

  const canonicalCandidate = aliases[options.rawFlag] ?? options.rawFlag;
  const globalConfig = globalOptionArgs[canonicalCandidate];
  if (globalConfig) {
    return {
      canonicalName: globalConfig.name,
      config: globalConfig,
      isGlobal: true,
    };
  }

  const localConfig = optionArgs[canonicalCandidate];
  if (localConfig) {
    return {
      canonicalName: localConfig.name,
      config: localConfig,
      isGlobal: false,
    };
  }

  return undefined;
}

function _isBuiltinHelpFlag(options: { cli: AnyCLI; token: string }): boolean {
  const { cli, token } = options;
  return (
    (token === "--help" || token === "-h") &&
    _findOptionEntry({ cli, rawFlag: "--help" }) === undefined &&
    (token === "--help" ||
      _findOptionEntry({ cli, rawFlag: "-h" }) === undefined)
  );
}

function _recordOptionValue(options: {
  state: Readonly<TokenScanState>;
  entry: Readonly<OptionLookupEntry>;
  rawValue: string;
}): TokenScanState {
  const { state, entry, rawValue } = options;
  if (entry.isGlobal) {
    return {
      ...state,
      pendingOption: undefined,
      rawGlobalOptionArgs: {
        ...state.rawGlobalOptionArgs,
        [entry.canonicalName]: rawValue,
      },
    };
  }

  return {
    ...state,
    pendingOption: undefined,
    rawOptionArgs: {
      ...state.rawOptionArgs,
      [entry.canonicalName]: rawValue,
    },
  };
}

function _mergeParentGlobalOptions(options: {
  parentCLI: AnyCLI;
  commandCLI: AnyCLI;
}): AnyCLI {
  const { globalOptionArgs } = _getScanCLIState(options.parentCLI);
  return Object.values(globalOptionArgs).reduce((mergedCLI, optionConfig) => {
    return mergedCLI.addGlobalOption(optionConfig);
  }, options.commandCLI);
}

function _consumePendingOptionToken(
  options: Readonly<Omit<StepTokenOptions, "remainingTokens">>,
): TokenScanState {
  const { cli, commandPath, state, token } = options;
  const pendingOption = state.pendingOption!;
  if (_isBuiltinHelpFlag({ cli, token })) {
    return { ...state, pendingOption: undefined, isHelpRequested: true };
  }

  const isDoubleDash = token === "--";
  const isRegisteredFlag =
    _isOptionLikeToken(token) &&
    _findOptionEntry({
      cli,
      rawFlag: _splitInlineOptionToken(token).rawFlag,
    }) !== undefined;
  const isUnregisteredFlag =
    _isOptionLikeToken(token) && !_isNegativeNumberToken(token);

  if (isDoubleDash || isRegisteredFlag || isUnregisteredFlag) {
    const missingError = attachCLIErrorHelpContext({
      cli,
      commandPath,
      error: CLIError.missingOptionValue({
        cliName: commandPath.join(" "),
        optionName: pendingOption.canonicalName,
      }),
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
  const { cli, commandPath, state, token } = options;
  if (_isBuiltinHelpFlag({ cli, token })) {
    return { ...state, isHelpRequested: true };
  }

  const { rawFlag, inlineValue } = _splitInlineOptionToken(token);
  const entry = _findOptionEntry({ cli, rawFlag });

  if (!entry) {
    if (inlineValue === undefined && _isNegativeNumberToken(token)) {
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
  const { cli, commandPath, state, token, remainingTokens } = options;
  const { commands } = _getScanCLIState(cli);
  const canMatchSubcommand =
    !state.isAfterDoubleDash &&
    state.scanError === undefined &&
    state.rawPositionalArgs.length === 0 &&
    Object.keys(state.rawOptionArgs).length === 0;
  const matchedCommandCLI = canMatchSubcommand ? commands[token] : undefined;

  if (matchedCommandCLI) {
    const commandCLI = _mergeParentGlobalOptions({
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
      }),
    };
  }

  return {
    ...state,
    rawPositionalArgs: [...state.rawPositionalArgs, token],
  };
}

function _stepToken(options: Readonly<StepTokenOptions>): TokenScanState {
  const { cli, commandPath, state, token, remainingTokens } = options;
  if (state.delegatedResult || state.isHelpRequested) {
    return state;
  }
  if (state.pendingOption) {
    return _consumePendingOptionToken({ cli, commandPath, state, token });
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
  if (_isOptionLikeToken(token)) {
    return _consumeFlagToken({ cli, commandPath, state, token });
  }
  return _consumePositionalOrCommandToken({
    cli,
    commandPath,
    state,
    token,
    remainingTokens,
  });
}

function _finalizeTokenScan(options: {
  cli: AnyCLI;
  commandPath: readonly string[];
  finalState: Readonly<TokenScanState>;
}): TokenizedCLIInput {
  const { cli, commandPath, finalState } = options;
  if (finalState.delegatedResult) {
    return finalState.delegatedResult;
  }

  if (finalState.isHelpRequested) {
    return {
      targetCLI: cli,
      commandPath: [...commandPath],
      isHelpRequested: true,
      rawPositionalArgs: finalState.rawPositionalArgs,
      rawOptionArgs: finalState.rawOptionArgs,
      rawGlobalOptionArgs: finalState.rawGlobalOptionArgs,
    };
  }

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
    });
  }

  return {
    targetCLI: cli,
    commandPath: [...commandPath],
    isHelpRequested: false,
    rawPositionalArgs: finalState.rawPositionalArgs,
    rawOptionArgs: finalState.rawOptionArgs,
    rawGlobalOptionArgs: finalState.rawGlobalOptionArgs,
  };
}

/**
 * Tokenizes raw CLI arguments against a command tree into positional tokens,
 * canonical local and global options, built-in `-h`/`--help` status, and the
 * matched target command CLI with its full invocation path.
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
  } = options;
  const initialState: TokenScanState = {
    isAfterDoubleDash: false,
    isHelpRequested: false,
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
    });
  }, initialState);

  return _finalizeTokenScan({ cli, commandPath, finalState });
}
