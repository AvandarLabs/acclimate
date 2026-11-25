import type {
  AnyCli,
  CliCommandName,
  CliFullOptionName,
  CliOptionParam,
} from "@/AcclimateCli/AcclimateCli.types";

const NEGATIVE_NUMBER_PATTERN = /^-(\d+(\.\d+)?|\.\d+)$/;

/** Matched option definition along with its canonical flag name and scope. */
export type OptionLookupEntry = {
  canonicalName: CliFullOptionName;
  config: CliOptionParam;
  isGlobal: boolean;
};

/**
 * Narrowed runtime snapshot of the CLI state fields inspected during scanning.
 */
export type RuntimeScanCliState = {
  aliases: Record<string, CliFullOptionName>;
  commands: Record<CliCommandName, AnyCli>;
  optionArgs: Record<string, CliOptionParam>;
  globalOptionArgs: Record<string, CliOptionParam>;
};

/** Narrow a type-erased `AnyCli` state for tokenizer lookups. */
export function getScanCliState(cli: AnyCli): RuntimeScanCliState {
  // AnyCli erases builder generics; narrow once at the tokenizer boundary.
  return cli.state as RuntimeScanCliState;
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
  cli: AnyCli;
  rawFlag: string;
}): OptionLookupEntry | undefined {
  const { aliases, globalOptionArgs, optionArgs } = getScanCliState(
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
  cli: AnyCli;
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
  parentCli: AnyCli;
  commandCli: AnyCli;
}): AnyCli {
  const { globalOptionArgs } = getScanCliState(options.parentCli);
  return Object.values(globalOptionArgs).reduce((mergedCli, optionConfig) => {
    return mergedCli.addGlobalOption(optionConfig);
  }, options.commandCli);
}
