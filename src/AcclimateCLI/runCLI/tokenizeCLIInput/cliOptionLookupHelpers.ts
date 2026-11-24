import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
} from "@/AcclimateCLI/AcclimateCLI.types";

const NEGATIVE_NUMBER_PATTERN = /^-(\d+(\.\d+)?|\.\d+)$/;

/** Matched option definition along with its canonical flag name and scope. */
export type OptionLookupEntry = {
  canonicalName: CLIFullOptionName;
  config: CLIOptionParam;
  isGlobal: boolean;
};

/**
 * Narrowed runtime snapshot of the CLI state fields inspected during scanning.
 */
export type RuntimeScanCLIState = {
  aliases: Record<string, CLIFullOptionName>;
  commands: Record<CLICommandName, AnyCLI>;
  optionArgs: Record<string, CLIOptionParam>;
  globalOptionArgs: Record<string, CLIOptionParam>;
};

/** Narrow a type-erased `AnyCLI` state for tokenizer lookups. */
export function getScanCLIState(cli: AnyCLI): RuntimeScanCLIState {
  // AnyCLI erases builder generics; narrow once at the tokenizer boundary.
  return cli.state as RuntimeScanCLIState;
}

/** Return true when a token starts with `-` and is not a lone `-`. */
export function isOptionLikeToken(token: string): boolean {
  return token.length > 1 && token.startsWith("-");
}

/** Return true when a token represents a negative numeric literal. */
export function isNegativeNumberToken(token: string): boolean {
  return NEGATIVE_NUMBER_PATTERN.test(token);
}

/** Split `--flag=value` into its flag name and inline value when present. */
export function splitInlineOptionToken(token: string): {
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

/**
 * Look up a flag or alias against the active CLI's global and local options.
 */
export function findOptionEntry(options: {
  cli: AnyCLI;
  rawFlag: string;
}): OptionLookupEntry | undefined {
  const { aliases, globalOptionArgs, optionArgs } = getScanCLIState(
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

/** Return true when `token` triggers built-in `-h`/`--help` on `cli`. */
export function isBuiltinHelpFlag(options: {
  cli: AnyCLI;
  token: string;
}): boolean {
  const { cli, token } = options;
  return (
    (token === "--help" || token === "-h") &&
    findOptionEntry({ cli, rawFlag: "--help" }) === undefined &&
    (token === "--help" ||
      findOptionEntry({ cli, rawFlag: "-h" }) === undefined)
  );
}

/** Merge a parent CLI's global options into a matched subcommand CLI. */
export function mergeParentGlobalOptions(options: {
  parentCLI: AnyCLI;
  commandCLI: AnyCLI;
}): AnyCLI {
  const { globalOptionArgs } = getScanCLIState(options.parentCLI);
  return Object.values(globalOptionArgs).reduce((mergedCLI, optionConfig) => {
    return mergedCLI.addGlobalOption(optionConfig);
  }, options.commandCLI);
}
