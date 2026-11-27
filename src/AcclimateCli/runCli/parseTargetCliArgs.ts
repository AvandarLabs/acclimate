import { camelCase } from "change-case";
import { match } from "ts-pattern";
import { CliError } from "@/CliError";
import { parseCliParamValue } from "./parseCliParamValue/parseCliParamValue";
import { promptCliParam } from "./promptCliParam/promptCliParam";
import type {
  CliFullOptionName,
  CliOptionParam,
  CliParamDataType,
  CliParamScalarValue,
  CliPositionalParam,
  CliScalarPositionalParam,
  CliVariadicPositionalParam,
} from "@/AcclimateCli/AcclimateCli.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";
import type { SemanticTheme } from "@/theme/theme.types";

type ParseTargetCliArgsOptions = {
  cliName: string;
  positionalArgs: readonly CliPositionalParam[];
  optionArgs: Readonly<Record<CliFullOptionName, CliOptionParam>>;
  globalOptionArgs: Readonly<Record<CliFullOptionName, CliOptionParam>>;
  rawPositionalArgs: readonly string[];
  rawOptionArgs: Readonly<Record<CliFullOptionName, string>>;
  rawGlobalOptionArgs: Readonly<Record<CliFullOptionName, string>>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
};

function _narrowParsedArray(options: {
  paramType: CliVariadicPositionalParam["type"];
  parsedValues: ReadonlyArray<CliParamScalarValue | undefined>;
}): string[] | number[] | boolean[] {
  return match(options.paramType)
    .with("string", () => {
      return options.parsedValues.filter((value): value is string => {
        return typeof value === "string";
      });
    })
    .with("number", () => {
      return options.parsedValues.filter((value): value is number => {
        return typeof value === "number";
      });
    })
    .with("boolean", () => {
      return options.parsedValues.filter((value): value is boolean => {
        return typeof value === "boolean";
      });
    })
    .exhaustive();
}

function _parseVariadicValues(options: {
  cliName: string;
  rawValues: readonly string[] | undefined;
  defaultValues:
    | readonly string[]
    | readonly number[]
    | readonly boolean[]
    | undefined;
  argConfig: CliVariadicPositionalParam;
}): string[] | number[] | boolean[] {
  const { cliName, rawValues, defaultValues, argConfig } = options;
  const parsedValues =
    rawValues !== undefined
      ? rawValues.map((rawValue) => {
          return parseCliParamValue({
            cliName,
            inputValue: rawValue,
            defaultValue: undefined,
            paramConfig: argConfig,
          });
        })
      : (defaultValues ?? []).map((defaultItem) => {
          return parseCliParamValue({
            cliName,
            inputValue: undefined,
            defaultValue: defaultItem,
            paramConfig: argConfig,
          });
        });

  return _narrowParsedArray({ paramType: argConfig.type, parsedValues });
}

function _toPromptableScalarParam(
  argConfig: Readonly<CliScalarPositionalParam | CliOptionParam>,
) {
  return {
    name: argConfig.name,
    description: argConfig.description,
    type: argConfig.type,
    required: argConfig.required,
    askIfEmpty: argConfig.askIfEmpty,
    defaultValue: argConfig.defaultValue,
    choices: "choices" in argConfig ? argConfig.choices : undefined,
  };
}

async function _promptVariadicPositionalArg(options: {
  cliName: string;
  argConfig: CliVariadicPositionalParam;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<string[] | number[] | boolean[] | undefined> {
  const { cliName, argConfig, getTerminalSession, theme } = options;
  const hasDefaults = argConfig.defaultValue !== undefined;
  const isInteractive = (await getTerminalSession()) !== undefined;
  const promptedValue = await promptCliParam({
    cliName,
    paramKind: "positional",
    param: {
      name: argConfig.name,
      description: argConfig.description,
      type: argConfig.type,
      required: isInteractive
        ? argConfig.required && !hasDefaults
        : argConfig.required,
      askIfEmpty: argConfig.askIfEmpty,
      defaultValue: undefined,
      choices: "choices" in argConfig ? argConfig.choices : undefined,
    },
    getTerminalSession,
    theme,
  });

  if (promptedValue !== undefined) {
    return _parseVariadicValues({
      cliName,
      rawValues: [promptedValue],
      defaultValues: undefined,
      argConfig,
    });
  }
  return isInteractive && hasDefaults
    ? _parseVariadicValues({
        cliName,
        rawValues: undefined,
        defaultValues: argConfig.defaultValue,
        argConfig,
      })
    : undefined;
}

async function _parseVariadicPositionalArg(options: {
  cliName: string;
  rawValues: readonly string[];
  argConfig: CliVariadicPositionalParam;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<string[] | number[] | boolean[]> {
  const { cliName, rawValues, argConfig, getTerminalSession, theme } = options;
  if (rawValues.length > 0) {
    return _parseVariadicValues({
      cliName,
      rawValues,
      defaultValues: undefined,
      argConfig,
    });
  }

  if (argConfig.askIfEmpty) {
    const promptedResult = await _promptVariadicPositionalArg({
      cliName,
      argConfig,
      getTerminalSession,
      theme,
    });
    if (promptedResult !== undefined) {
      return promptedResult;
    }
  }

  if (argConfig.required) {
    throw CliError.missingRequiredPositionalArg({
      cliName,
      positionalArgName: argConfig.name,
    });
  }

  return _parseVariadicValues({
    cliName,
    rawValues: undefined,
    defaultValues: argConfig.defaultValue,
    argConfig,
  });
}

async function _parseScalarPositionalArg(options: {
  cliName: string;
  rawValue: string | undefined;
  argConfig: CliScalarPositionalParam;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<CliParamScalarValue | undefined> {
  const { cliName, argConfig, getTerminalSession, theme } = options;
  const effectiveRawValue =
    argConfig.askIfEmpty && options.rawValue === undefined
      ? await promptCliParam({
          cliName,
          paramKind: "positional",
          param: _toPromptableScalarParam(argConfig),
          getTerminalSession,
          theme,
        })
      : options.rawValue;

  if (argConfig.required && effectiveRawValue === undefined) {
    throw CliError.missingRequiredPositionalArg({
      cliName,
      positionalArgName: argConfig.name,
    });
  }

  return parseCliParamValue({
    cliName,
    inputValue: effectiveRawValue,
    defaultValue: argConfig.defaultValue,
    paramConfig: argConfig,
  });
}

async function _parsePositionalArgs(options: {
  cliName: string;
  positionalArgs: readonly CliPositionalParam[];
  rawPositionalArgs: readonly string[];
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<Record<string, CliParamDataType>> {
  const {
    cliName,
    positionalArgs,
    rawPositionalArgs,
    getTerminalSession,
    theme,
  } = options;
  const hasVariadicArg = positionalArgs.some((argConfig) => {
    return argConfig.variadic === true;
  });

  if (!hasVariadicArg && rawPositionalArgs.length > positionalArgs.length) {
    throw CliError.tooManyPositionalArgs({
      cliName,
      count: rawPositionalArgs.length,
    });
  }

  const entries: Array<[string, CliParamDataType]> = [];
  for (const [idx, argConfig] of positionalArgs.entries()) {
    const baseOptions = { cliName, argConfig, getTerminalSession, theme };
    const parsedValue =
      argConfig.variadic === true
        ? await _parseVariadicPositionalArg({
            ...baseOptions,
            argConfig,
            rawValues: rawPositionalArgs.slice(idx),
          })
        : await _parseScalarPositionalArg({
            ...baseOptions,
            argConfig,
            rawValue: rawPositionalArgs[idx],
          });
    entries.push([argConfig.name, parsedValue]);
  }
  return Object.fromEntries(entries);
}

async function _parseOptionGroup(options: {
  cliName: string;
  optionDefs: readonly CliOptionParam[];
  rawOptions: Readonly<Record<CliFullOptionName, string>>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<Record<string, CliParamDataType>> {
  const { cliName, optionDefs, rawOptions, getTerminalSession, theme } =
    options;
  const entries: Array<[string, CliParamDataType]> = [];

  for (const argConfig of optionDefs) {
    const rawValue = rawOptions[argConfig.name];
    const effectiveRawValue =
      argConfig.askIfEmpty && rawValue === undefined
        ? await promptCliParam({
            cliName,
            paramKind: "option",
            param: _toPromptableScalarParam(argConfig),
            getTerminalSession,
            theme,
          })
        : rawValue;

    if (argConfig.required && effectiveRawValue === undefined) {
      throw CliError.missingRequiredOption({
        cliName,
        optionName: argConfig.name,
      });
    }

    const parsedValue = parseCliParamValue({
      cliName,
      inputValue: effectiveRawValue,
      defaultValue: argConfig.defaultValue,
      paramConfig: argConfig,
    });
    entries.push([camelCase(argConfig.name), parsedValue]);
  }

  return Object.fromEntries(entries);
}

/**
 * Allocates, prompts for missing `askIfEmpty` parameters, and validates all
 * positional arguments, local options, and global options for a matched target
 * command CLI.
 *
 * Called by `runCli` after subcommand resolution and before running the action.
 */
export async function parseTargetCliArgs(
  options: Readonly<ParseTargetCliArgsOptions>,
): Promise<Record<string, CliParamDataType>> {
  const parsedPositionalArgs = await _parsePositionalArgs({
    cliName: options.cliName,
    positionalArgs: options.positionalArgs,
    rawPositionalArgs: options.rawPositionalArgs,
    getTerminalSession: options.getTerminalSession,
    theme: options.theme,
  });
  const parsedOptionArgs = await _parseOptionGroup({
    cliName: options.cliName,
    optionDefs: Object.values(options.optionArgs),
    rawOptions: options.rawOptionArgs,
    getTerminalSession: options.getTerminalSession,
    theme: options.theme,
  });
  const parsedGlobalOptionArgs = await _parseOptionGroup({
    cliName: options.cliName,
    optionDefs: Object.values(options.globalOptionArgs),
    rawOptions: options.rawGlobalOptionArgs,
    getTerminalSession: options.getTerminalSession,
    theme: options.theme,
  });

  return {
    ...parsedPositionalArgs,
    ...parsedOptionArgs,
    ...parsedGlobalOptionArgs,
  };
}
