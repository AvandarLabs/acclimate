import { camelCase } from "change-case";
import { match } from "ts-pattern";
import { generateHelpText } from "@/AcclimateCLI/generateHelpText/generateHelpText";
import { CLIError } from "@/CLIError";
import { requestTerminalInput } from "@/requestTerminalInput";
import { parseCLIParamValue } from "./parseCLIParamValue/parseCLIParamValue";
import { tokenizeCLIInput } from "./tokenizeCLIInput/tokenizeCLIInput";
import type {
  AnyCLI,
  CLIFullOptionName,
  CLIOptionParam,
  CLIParamDataType,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIScalarPositionalParam,
  CLIVariadicPositionalParam,
} from "@/AcclimateCLI/AcclimateCLI.types";

type PromptableParam = {
  name: string;
  description?: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  askIfEmpty?: boolean | { message: string };
  defaultValue?: CLIParamScalarValue;
};

type RuntimeTargetCLIState = {
  positionalArgs: readonly CLIPositionalParam[];
  optionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  globalOptionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  action?: (args: Record<string, CLIParamDataType>) => void;
};

async function _askForValue(
  argConfig: Readonly<PromptableParam>,
): Promise<string | undefined> {
  const description =
    argConfig.description ? ` (${argConfig.description})` : "";
  const baseMessage =
    typeof argConfig.askIfEmpty === "object" ?
      argConfig.askIfEmpty.message
    : `Please enter a value for ${argConfig.name}${description}`;
  return requestTerminalInput({
    message: `|bright_cyan|${baseMessage}|reset|`,
    params: {},
    responseOptions: {
      required: argConfig.required,
      type: argConfig.type,
      defaultValue: argConfig.defaultValue,
    },
  });
}

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

async function _promptVariadicPositionalArg(options: {
  cliName: string;
  argConfig: CLIVariadicPositionalParam;
}): Promise<string[] | number[] | boolean[] | undefined> {
  const { cliName, argConfig } = options;
  const hasDefaults = argConfig.defaultValue !== undefined;
  const promptedValue = await _askForValue({
    name: argConfig.name,
    description: argConfig.description,
    type: argConfig.type,
    required: argConfig.required && !hasDefaults,
    askIfEmpty: argConfig.askIfEmpty,
    defaultValue: undefined,
  });

  if (promptedValue !== undefined) {
    return _parseVariadicValues({
      cliName,
      rawValues: [promptedValue],
      defaultValues: undefined,
      argConfig,
    });
  }
  if (hasDefaults) {
    return _parseVariadicValues({
      cliName,
      rawValues: undefined,
      defaultValues: argConfig.defaultValue,
      argConfig,
    });
  }
  return undefined;
}

async function _parseVariadicPositionalArg(options: {
  cliName: string;
  rawValues: readonly string[];
  argConfig: CLIVariadicPositionalParam;
}): Promise<string[] | number[] | boolean[]> {
  const { cliName, rawValues, argConfig } = options;
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
}): Promise<CLIParamScalarValue | undefined> {
  const { cliName, argConfig } = options;
  const effectiveRawValue =
    argConfig.askIfEmpty && options.rawValue === undefined ?
      await _askForValue(argConfig)
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
}): Promise<Record<string, CLIParamDataType>> {
  const { cliName, positionalArgs, rawPositionalArgs } = options;
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
    const parsedValue =
      argConfig.variadic === true ?
        await _parseVariadicPositionalArg({
          cliName,
          rawValues: rawPositionalArgs.slice(idx),
          argConfig,
        })
      : await _parseScalarPositionalArg({
          cliName,
          rawValue: rawPositionalArgs[idx],
          argConfig,
        });
    entries.push([argConfig.name, parsedValue]);
  }
  return Object.fromEntries(entries);
}

async function _parseOptionGroup(options: {
  cliName: string;
  optionDefs: readonly CLIOptionParam[];
  rawOptions: Readonly<Record<CLIFullOptionName, string>>;
}): Promise<Record<string, CLIParamDataType>> {
  const { cliName, optionDefs, rawOptions } = options;
  const entries: Array<[string, CLIParamDataType]> = [];

  for (const argConfig of optionDefs) {
    const rawValue = rawOptions[argConfig.name];
    const effectiveRawValue =
      argConfig.askIfEmpty && rawValue === undefined ?
        await _askForValue(argConfig)
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
 * Parses raw argv tokens against a CLI definition, runs interactive prompts
 * for any missing `askIfEmpty` parameters, validates all positional and option
 * values, and invokes the matched command's action (or prints help text when
 * no action is configured).
 */
export async function runCLI(options: {
  input: readonly string[];
  cli: AnyCLI;
}): Promise<void> {
  const { targetCLI, rawPositionalArgs, rawOptionArgs, rawGlobalOptionArgs } =
    tokenizeCLIInput({
      cli: options.cli,
      input: options.input,
    });

  const cliName = targetCLI.getName();
  // AnyCLI erases builder generics; narrow once at the execution boundary.
  const targetState = targetCLI.state as RuntimeTargetCLIState;

  const parsedPositionalArgs = await _parsePositionalArgs({
    cliName,
    positionalArgs: targetState.positionalArgs,
    rawPositionalArgs,
  });
  const parsedOptionArgs = await _parseOptionGroup({
    cliName,
    optionDefs: Object.values(targetState.optionArgs),
    rawOptions: rawOptionArgs,
  });
  const parsedGlobalOptionArgs = await _parseOptionGroup({
    cliName,
    optionDefs: Object.values(targetState.globalOptionArgs),
    rawOptions: rawGlobalOptionArgs,
  });

  if (targetState.action) {
    targetState.action({
      ...parsedPositionalArgs,
      ...parsedOptionArgs,
      ...parsedGlobalOptionArgs,
    });
    return;
  }

  console.log(generateHelpText(targetCLI));
}
