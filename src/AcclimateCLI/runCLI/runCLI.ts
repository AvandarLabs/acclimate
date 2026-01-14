import { camelCase } from "change-case";
import { match } from "ts-pattern";
import { CLIError } from "@/CLIError";
import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionAlias,
  CLIOptionParam,
  CLIParam,
  CLIParamDataType,
  CLIPositionalParam,
  CLIPositionalParamName,
  CLIState,
  FullCLIArgValues,
  IAcclimateCLI,
  ValueOfParam,
} from "@/AcclimateCLI/AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

function _isValidFullOptionName(name: string): name is CLIFullOptionName {
  return name.startsWith("--");
}

function _isValidOptionAlias(name: string): name is CLIOptionAlias {
  return name.startsWith("-");
}

function isEmptyObject(obj: object): obj is EmptyObject {
  return Object.keys(obj).length === 0;
}

function _validateParsedValue<
  P extends CLIParam<string>,
  PValue extends ValueOfParam<P>,
>(options: { parsedValue: PValue; paramConfig: P }): PValue {
  const { parsedValue, paramConfig } = options;
  if (paramConfig.validator) {
    const validator = paramConfig.validator as (
      value: PValue,
    ) => boolean | string;
    const validationResult = validator(parsedValue);
    if (validationResult === true) {
      return parsedValue;
    }
    throw CLIError.invalidCLIParamValue({
      paramName: paramConfig.name,
      paramValue: parsedValue,
      message:
        typeof validationResult === "string" ? validationResult : undefined,
    });
  }
  return parsedValue;
}

function _parseAndValidateValue<
  P extends CLIParam<string>,
  PValue extends ValueOfParam<P>,
>(options: {
  inputValue: string | undefined;
  defaultValue: PValue | undefined;
  paramConfig: P;
}): PValue {
  const { inputValue, defaultValue, paramConfig } = options;
  if (inputValue === undefined) {
    // if there is no input value, we use the default value for validation.
    // if there is no default value, we throw an error.
    if (defaultValue === undefined) {
      if (_isValidFullOptionName(paramConfig.name)) {
        throw CLIError.missingRequiredOption({
          optionName: paramConfig.name,
        });
      } else {
        throw CLIError.missingRequiredPositionalArg({
          positionalArgName: paramConfig.name,
        });
      }
    }

    // and then just validate it. (no need to parse it first)
    return _validateParsedValue({
      parsedValue: defaultValue,
      paramConfig,
    });
  }

  const parsedValue =
    paramConfig.parser ?
      (paramConfig.parser(inputValue) as PValue)
      // if no parser was set, we use the default parser
    : (match(paramConfig.type)
        .with("boolean", () => {
          return inputValue === "false" ? false : true;
        })
        .with("number", () => {
          return Number.parseInt(inputValue, 10);
        })
        .with("string", () => {
          return inputValue;
        })
        .exhaustive(() => {
          return inputValue;
        }) as PValue);
  return _validateParsedValue({
    parsedValue,
    paramConfig,
  });
}

function _replaceAliases<
  TGlobalOptionArgs extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject,
  TOptionArgs extends Record<CLIFullOptionName, CLIOptionParam> | EmptyObject,
  TPositionalArgs extends
    | Record<CLIPositionalParamName, CLIOptionParam>
    | EmptyObject,
  TCommands extends Record<CLICommandName, AnyCLI> | EmptyObject,
>({
  aliasedOptionArgs,
  cli,
}: {
  aliasedOptionArgs: Record<CLIOptionAlias, string>;
  cli: IAcclimateCLI<
    TGlobalOptionArgs,
    TOptionArgs,
    TPositionalArgs,
    TCommands
  >;
}): Record<CLIOptionAlias, string> {
  const aliasMap = cli.state.aliases;
  return Object.entries(aliasedOptionArgs).reduce(
    (acc, [aliasKey, value]) => {
      const alias = aliasKey as CLIOptionAlias;
      const optionName = aliasMap[alias] ?? alias;
      acc[optionName] = value;
      return acc;
    },
    {} as Record<CLIOptionAlias, string>,
  );
}

function _runCLIHelper<
  TPositionalParams extends
    | Record<CLIPositionalParamName, CLIPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CLIFullOptionName, CLIOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject,
  TCommands extends Record<CLICommandName, AnyCLI> | EmptyObject,
>(options: {
  rawPositionalArgs: string[];
  rawOptionArgs: Record<CLIOptionAlias, string>;
  rawGlobalOptionArgs: Record<CLIFullOptionName, string>;
  cli: IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;
}): void {
  const { rawGlobalOptionArgs, rawOptionArgs, rawPositionalArgs, cli } = {
    ...options,
    rawGlobalOptionArgs: _replaceAliases({
      aliasedOptionArgs: options.rawGlobalOptionArgs,
      cli: options.cli,
    }),
    rawOptionArgs: _replaceAliases({
      aliasedOptionArgs: options.rawOptionArgs,

      // TODO(jpsyx): fix that this does not have the CLI may not have all
      cli: options.cli,
    }),
  };

  // is the first argument a command?
  const firstArg = rawPositionalArgs[0];
  if (
    firstArg &&
    !isEmptyObject(cli.state.commands) &&
    cli.state.commands[firstArg]
  ) {
    // add the parent's global options to the sub-command
    const commandCLI = Object.values(
      cli.state.globalOptionArgs as Record<CLIFullOptionName, CLIOptionParam>,
    ).reduce(
      (newCmd, argConfig) => {
        return newCmd.addGlobalOption(argConfig);
      },
      cli.getCommandCLI(firstArg as Extract<keyof TCommands, string>) as AnyCLI,
    );

    // run the sub-command
    return _runCLIHelper({
      rawPositionalArgs: rawPositionalArgs.slice(1),
      rawOptionArgs,
      rawGlobalOptionArgs,
      cli: commandCLI,
    });
  }

  // build the positional arguments dictionary
  // first check that we haven't supplied too many positional arguments
  if (rawPositionalArgs.length > cli.state.positionalArgs.length) {
    throw CLIError.tooManyPositionalArgs({
      count: rawPositionalArgs.length,
    });
  }

  // parse positional arguments
  const parsedPositionalArgs = cli.state.positionalArgs.reduce(
    (acc, argConfig, idx) => {
      const rawVal = rawPositionalArgs[idx];
      if (argConfig.required && rawVal === undefined) {
        throw CLIError.missingRequiredPositionalArg({
          positionalArgName: argConfig.name,
        });
      }
      acc[argConfig.name] = _parseAndValidateValue({
        inputValue: rawVal,
        defaultValue: argConfig.defaultValue,
        paramConfig: argConfig,
      });
      return acc;
    },
    {} as Record<string, CLIParamDataType>,
  );

  // parse the options
  const parsedOptionArgs = Object.values(
    cli.state.optionArgs as Record<CLIFullOptionName, CLIOptionParam>,
  ).reduce(
    (acc, argConfig) => {
      const rawVal = rawOptionArgs[argConfig.name];
      if (argConfig.required && rawVal === undefined) {
        throw CLIError.missingRequiredOption({
          optionName: argConfig.name,
        });
      }

      acc[camelCase(argConfig.name)] = _parseAndValidateValue({
        inputValue: rawVal,
        defaultValue: argConfig.defaultValue,
        paramConfig: argConfig,
      });
      return acc;
    },
    {} as Record<string, CLIParamDataType>,
  );

  // parse the global options
  const parsedGlobalOptionArgs = Object.values(
    cli.state.globalOptionArgs as Record<CLIFullOptionName, CLIOptionParam>,
  ).reduce(
    (acc, argConfig) => {
      const rawVal = rawGlobalOptionArgs[argConfig.name];
      if (argConfig.required && rawVal === undefined) {
        throw CLIError.missingRequiredOption({
          optionName: argConfig.name,
        });
      }
      acc[camelCase(argConfig.name)] = _parseAndValidateValue({
        inputValue: rawVal,
        defaultValue: argConfig.defaultValue,
        paramConfig: argConfig,
      });
      return acc;
    },
    {} as Record<string, CLIParamDataType>,
  );

  // run the action
  cli.state.action({
    ...parsedPositionalArgs,
    ...parsedOptionArgs,
    ...parsedGlobalOptionArgs,
  } as FullCLIArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>);
}

/**
 * Run a CLI instance given an array of inputs.
 *
 * @param options - The options for running the CLI.
 */
export function runCLI(options: { input: string[]; cli: AnyCLI }): void {
  const { input, cli } = options;
  const firstOptionIdx = input.findIndex((token) => {
    return token.startsWith("-");
  });

  const [rawPositionalArgs, rest] =
    firstOptionIdx === -1 ?
      [input, []]
    : [input.slice(0, firstOptionIdx), input.slice(firstOptionIdx)];

  const rawOptionArgs: Record<CLIOptionAlias, string> = {};
  const rawGlobalOptionArgs: Record<CLIFullOptionName, string> = {};
  let currentAlias: CLIOptionAlias | undefined;
  let currentVals: string[] = [];

  const { aliases, globalOptionArgs } = cli.state as CLIState<
    Record<CLIFullOptionName, CLIOptionParam>,
    Record<CLIFullOptionName, CLIOptionParam>,
    Record<CLIPositionalParamName, CLIOptionParam>,
    Record<CLICommandName, AnyCLI>
  >;

  for (const argVal of rest.concat("-")) {
    if (_isValidOptionAlias(argVal)) {
      if (currentAlias) {
        const rawValue = currentVals.join(" ");
        const optionName = aliases[currentAlias] ?? currentAlias;
        if (
          _isValidFullOptionName(optionName) &&
          !isEmptyObject(globalOptionArgs) &&
          globalOptionArgs[optionName]
        ) {
          rawGlobalOptionArgs[optionName] = rawValue;
        } else {
          rawOptionArgs[optionName] = rawValue;
        }
      }
      currentAlias = argVal;
      currentVals = [];
    } else {
      currentVals.push(argVal);
    }
  }

  _runCLIHelper({ rawPositionalArgs, rawOptionArgs, rawGlobalOptionArgs, cli });
}
