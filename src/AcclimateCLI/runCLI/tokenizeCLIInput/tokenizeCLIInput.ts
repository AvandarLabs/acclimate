import { CLIError } from "@/CLIError";
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
  inheritedGlobalOptionArgs?: Readonly<Record<CLIFullOptionName, string>>;
};

/** Result of tokenizing raw CLI argv tokens against a command hierarchy. */
export type TokenizedCLIInput = {
  targetCLI: AnyCLI;
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
  pendingOption: OptionLookupEntry | undefined;
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

function _consumePendingOptionToken(options: {
  cli: AnyCLI;
  state: Readonly<TokenScanState>;
  token: string;
}): TokenScanState {
  const { cli, state, token } = options;
  const pendingOption = state.pendingOption!;
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
    throw CLIError.missingOptionValue({
      cliName: cli.getName(),
      optionName: pendingOption.canonicalName,
    });
  }

  return _recordOptionValue({
    state,
    entry: pendingOption,
    rawValue: token,
  });
}

function _consumeFlagToken(options: {
  cli: AnyCLI;
  state: Readonly<TokenScanState>;
  token: string;
}): TokenScanState {
  const { cli, state, token } = options;
  const { rawFlag, inlineValue } = _splitInlineOptionToken(token);
  const entry = _findOptionEntry({ cli, rawFlag });

  if (!entry) {
    if (inlineValue === undefined && _isNegativeNumberToken(token)) {
      return {
        ...state,
        rawPositionalArgs: [...state.rawPositionalArgs, token],
      };
    }
    throw CLIError.unknownOption({
      cliName: cli.getName(),
      optionName: rawFlag,
    });
  }

  if (inlineValue !== undefined) {
    return _recordOptionValue({ state, entry, rawValue: inlineValue });
  }

  if (entry.config.type === "boolean") {
    return _recordOptionValue({ state, entry, rawValue: "" });
  }

  return { ...state, pendingOption: entry };
}

function _consumePositionalOrCommandToken(options: {
  cli: AnyCLI;
  state: Readonly<TokenScanState>;
  token: string;
  remainingTokens: readonly string[];
}): TokenScanState {
  const { cli, state, token, remainingTokens } = options;
  const { commands } = _getScanCLIState(cli);
  const canMatchSubcommand =
    !state.isAfterDoubleDash &&
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
        inheritedGlobalOptionArgs: state.rawGlobalOptionArgs,
      }),
    };
  }

  return {
    ...state,
    rawPositionalArgs: [...state.rawPositionalArgs, token],
  };
}

function _stepToken(options: {
  cli: AnyCLI;
  state: Readonly<TokenScanState>;
  token: string;
  remainingTokens: readonly string[];
}): TokenScanState {
  const { cli, state, token, remainingTokens } = options;
  if (state.delegatedResult) {
    return state;
  }
  if (state.pendingOption) {
    return _consumePendingOptionToken({ cli, state, token });
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
    return _consumeFlagToken({ cli, state, token });
  }
  return _consumePositionalOrCommandToken({
    cli,
    state,
    token,
    remainingTokens,
  });
}

/**
 * Tokenizes raw CLI arguments against a command tree into positional tokens,
 * canonical local options, canonical global options, and the matched target
 * command CLI. Handles interleaved flags, `=value` assignments, `--`
 * end-of-options markers, and global options passed before sub-commands.
 *
 * Called by `runCLI` before value parsing and interactive prompting.
 */
export function tokenizeCLIInput(
  options: Readonly<TokenizeCLIInputOptions>,
): TokenizedCLIInput {
  const { cli, input, inheritedGlobalOptionArgs = {} } = options;
  const initialState: TokenScanState = {
    isAfterDoubleDash: false,
    pendingOption: undefined,
    rawPositionalArgs: [],
    rawOptionArgs: {},
    rawGlobalOptionArgs: { ...inheritedGlobalOptionArgs },
    delegatedResult: undefined,
  };

  const finalState = input.reduce((state, token, idx) => {
    return _stepToken({
      cli,
      state,
      token,
      remainingTokens: input.slice(idx + 1),
    });
  }, initialState);

  if (finalState.delegatedResult) {
    return finalState.delegatedResult;
  }

  if (finalState.pendingOption) {
    throw CLIError.missingOptionValue({
      cliName: cli.getName(),
      optionName: finalState.pendingOption.canonicalName,
    });
  }

  return {
    targetCLI: cli,
    rawPositionalArgs: finalState.rawPositionalArgs,
    rawOptionArgs: finalState.rawOptionArgs,
    rawGlobalOptionArgs: finalState.rawGlobalOptionArgs,
  };
}
