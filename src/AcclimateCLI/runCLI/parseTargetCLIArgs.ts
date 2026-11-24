import { camelCase } from "change-case";
import { match } from "ts-pattern";
import { CLIError } from "@/CLIError";
import { parseCLIParamValue } from "./parseCLIParamValue/parseCLIParamValue";
import { promptCLIParam } from "./promptCLIParam/promptCLIParam";
import type {
  CLIFullOptionName,
  CLIOptionParam,
  CLIParamDataType,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIScalarPositionalParam,
  CLIVariadicPositionalParam,
} from "@/AcclimateCLI/AcclimateCLI.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";
import type { SemanticTheme } from "@/theme/theme.types";

type ParseTargetCLIArgsOptions = {
  cliName: string;
  positionalArgs: readonly CLIPositionalParam[];
  optionArgs: Readonly<Record<CLIFullOptionName, CLIOptionParam>>;
  globalOptionArgs: Readonly<Record<CLIFullOptionName, CLIOptionParam>>;
  rawPositionalArgs: readonly string[];
  rawOptionArgs: Readonly<Record<CLIFullOptionName, string>>;
  rawGlobalOptionArgs: Readonly<Record<CLIFullOptionName, string>>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
};

function _narrowParsedArray(options: {
  paramType: CLIVariadicPositionalParam["type"];
  parsedValues: ReadonlyArray<CLIParamScalarValue | undefined>;
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
  argConfig: CLIVariadicPositionalParam;
}): string[] | number[] | boolean[] {
  const { cliName, rawValues, defaultValues, argConfig } = options;
  const parsedValues =
    rawValues !== undefined ?
      rawValues.map((rawValue) => {
        return parseCLIParamValue({
          cliName,
          inputValue: rawValue,
          defaultValue: undefined,
          paramConfig: argConfig,
        });
      })
    : (defaultValues ?? []).map((defaultItem) => {
        return parseCLIParamValue({
          cliName,
          inputValue: undefined,
          defaultValue: defaultItem,
          paramConfig: argConfig,
        });
      });

  return _narrowParsedArray({ paramType: argConfig.type, parsedValues });
}

function _toPromptableScalarParam(
  argConfig: Readonly<CLIScalarPositionalParam | CLIOptionParam>,
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
  argConfig: CLIVariadicPositionalParam;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<string[] | number[] | boolean[] | undefined> {
  const { cliName, argConfig, getTerminalSession, theme } = options;
  const hasDefaults = argConfig.defaultValue !== undefined;
  const isInteractive = (await getTerminalSession()) !== undefined;
  const promptedValue = await promptCLIParam({
    cliName,
    paramKind: "positional",
    param: {
      name: argConfig.name,
      description: argConfig.description,
      type: argConfig.type,
      required:
        isInteractive ? argConfig.required && !hasDefaults : argConfig.required,
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
  return isInteractive && hasDefaults ?
      _parseVariadicValues({
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
  argConfig: CLIVariadicPositionalParam;
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
    throw CLIError.missingRequiredPositionalArg({
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
  argConfig: CLIScalarPositionalParam;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<CLIParamScalarValue | undefined> {
  const { cliName, argConfig, getTerminalSession, theme } = options;
  const effectiveRawValue =
    argConfig.askIfEmpty && options.rawValue === undefined ?
      await promptCLIParam({
        cliName,
        paramKind: "positional",
        param: _toPromptableScalarParam(argConfig),
        getTerminalSession,
        theme,
      })
    : options.rawValue;

  if (argConfig.required && effectiveRawValue === undefined) {
    throw CLIError.missingRequiredPositionalArg({
      cliName,
      positionalArgName: argConfig.name,
    });
  }

  return parseCLIParamValue({
    cliName,
    inputValue: effectiveRawValue,
    defaultValue: argConfig.defaultValue,
    paramConfig: argConfig,
  });
}

async function _parsePositionalArgs(options: {
  cliName: string;
  positionalArgs: readonly CLIPositionalParam[];
  rawPositionalArgs: readonly string[];
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<Record<string, CLIParamDataType>> {
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
    throw CLIError.tooManyPositionalArgs({
      cliName,
      count: rawPositionalArgs.length,
    });
  }

  const entries: Array<[string, CLIParamDataType]> = [];
  for (const [idx, argConfig] of positionalArgs.entries()) {
    const baseOptions = { cliName, argConfig, getTerminalSession, theme };
    const parsedValue =
      argConfig.variadic === true ?
        await _parseVariadicPositionalArg({
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
  optionDefs: readonly CLIOptionParam[];
  rawOptions: Readonly<Record<CLIFullOptionName, string>>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
}): Promise<Record<string, CLIParamDataType>> {
  const { cliName, optionDefs, rawOptions, getTerminalSession, theme } =
    options;
  const entries: Array<[string, CLIParamDataType]> = [];

  for (const argConfig of optionDefs) {
    const rawValue = rawOptions[argConfig.name];
    const effectiveRawValue =
      argConfig.askIfEmpty && rawValue === undefined ?
        await promptCLIParam({
          cliName,
          paramKind: "option",
          param: _toPromptableScalarParam(argConfig),
          getTerminalSession,
          theme,
        })
      : rawValue;

    if (argConfig.required && effectiveRawValue === undefined) {
      throw CLIError.missingRequiredOption({
        cliName,
        optionName: argConfig.name,
      });
    }

    const parsedValue = parseCLIParamValue({
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
 * Called by `runCLI` after subcommand resolution and before running the action.
 */
export async function parseTargetCLIArgs(
  options: Readonly<ParseTargetCLIArgsOptions>,
): Promise<Record<string, CLIParamDataType>> {
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
