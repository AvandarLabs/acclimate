import { match } from "ts-pattern";
import { CLIError } from "@/CLIError";
import type {
  CLIBooleanParam,
  CLINumberParam,
  CLIParam,
  CLIParamScalarValue,
  CLIStringParam,
  CLIVariadicBooleanParam,
  CLIVariadicNumberParam,
  CLIVariadicPositionalParam,
  CLIVariadicStringParam,
} from "@/AcclimateCLI/CLIParam.types";

type ParseableParamConfig =
  | CLIParam<string>
  | CLIVariadicPositionalParam<string>;

type ParseCLIParamValueOptions = {
  cliName: string;
  inputValue: string | undefined;
  defaultValue: CLIParamScalarValue | undefined;
  paramConfig: ParseableParamConfig;
};

function _validateChoice<TValue extends CLIParamScalarValue>(options: {
  cliName: string;
  paramName: string;
  parsedValue: TValue;
  choices: readonly TValue[] | undefined;
}): void {
  const { cliName, paramName, parsedValue, choices } = options;
  if (!choices || choices.length === 0) {
    return;
  }

  const isAllowed = choices.some((choice) => {
    return choice === parsedValue;
  });
  if (!isAllowed) {
    const allowedList = choices.join(", ");
    throw CLIError.invalidCLIParamValue({
      cliName,
      paramName,
      paramValue: parsedValue,
      message: `Invalid value "${String(parsedValue)}" for "${paramName}". Expected one of: ${allowedList}`,
    });
  }
}

function _validateWithValidator<TValue extends CLIParamScalarValue>(options: {
  cliName: string;
  paramName: string;
  parsedValue: TValue;
  validator: ((value: TValue) => boolean | string) | undefined;
}): TValue {
  const { cliName, paramName, parsedValue, validator } = options;
  if (!validator) {
    return parsedValue;
  }

  const validationResult = validator(parsedValue);
  if (validationResult === true) {
    return parsedValue;
  }

  throw CLIError.invalidCLIParamValue({
    cliName,
    paramName,
    paramValue: parsedValue,
    message:
      typeof validationResult === "string" ? validationResult : undefined,
  });
}

function _parseDefaultNumber(options: {
  cliName: string;
  paramName: string;
  inputValue: string;
}): number {
  const parsedNumber = Number.parseInt(options.inputValue, 10);
  if (Number.isNaN(parsedNumber)) {
    throw CLIError.invalidCLIParamValue({
      cliName: options.cliName,
      paramName: options.paramName,
      paramValue: options.inputValue,
      message: `Invalid number "${options.inputValue}" for "${options.paramName}"`,
    });
  }
  return parsedNumber;
}

function _parseStringValue(options: {
  cliName: string;
  inputValue: string | undefined;
  defaultValue: CLIParamScalarValue | undefined;
  paramConfig: CLIStringParam<string> | CLIVariadicStringParam<string>;
}): string | undefined {
  const { cliName, inputValue, defaultValue, paramConfig } = options;
  const parsedValue =
    inputValue !== undefined ?
      paramConfig.parser ?
        paramConfig.parser(inputValue)
      : inputValue
    : typeof defaultValue === "string" ? defaultValue
    : undefined;
  if (parsedValue === undefined) {
    return undefined;
  }
  _validateChoice({
    cliName,
    paramName: paramConfig.name,
    parsedValue,
    choices: paramConfig.choices,
  });
  return _validateWithValidator({
    cliName,
    paramName: paramConfig.name,
    parsedValue,
    validator: paramConfig.validator,
  });
}

function _parseNumberValue(options: {
  cliName: string;
  inputValue: string | undefined;
  defaultValue: CLIParamScalarValue | undefined;
  paramConfig: CLINumberParam<string> | CLIVariadicNumberParam<string>;
}): number | undefined {
  const { cliName, inputValue, defaultValue, paramConfig } = options;
  const parsedValue =
    inputValue !== undefined ?
      paramConfig.parser ?
        paramConfig.parser(inputValue)
      : _parseDefaultNumber({
          cliName,
          paramName: paramConfig.name,
          inputValue,
        })
    : typeof defaultValue === "number" ? defaultValue
    : undefined;
  if (parsedValue === undefined) {
    return undefined;
  }
  _validateChoice({
    cliName,
    paramName: paramConfig.name,
    parsedValue,
    choices: paramConfig.choices,
  });
  return _validateWithValidator({
    cliName,
    paramName: paramConfig.name,
    parsedValue,
    validator: paramConfig.validator,
  });
}

function _parseBooleanValue(options: {
  cliName: string;
  inputValue: string | undefined;
  defaultValue: CLIParamScalarValue | undefined;
  paramConfig: CLIBooleanParam<string> | CLIVariadicBooleanParam<string>;
}): boolean | undefined {
  const { cliName, inputValue, defaultValue, paramConfig } = options;
  const parsedValue =
    inputValue !== undefined ?
      paramConfig.parser ?
        paramConfig.parser(inputValue)
      : inputValue !== "false"
    : typeof defaultValue === "boolean" ? defaultValue
    : undefined;
  if (parsedValue === undefined) {
    return undefined;
  }
  return _validateWithValidator({
    cliName,
    paramName: paramConfig.name,
    parsedValue,
    validator: paramConfig.validator,
  });
}

/**
 * Parses and validates a single raw CLI argument or default value against a
 * parameter definition, enforcing numeric conversion, `choices`, and custom
 * `parser`/`validator` hooks. Used by `runCLI` for options, scalar positionals,
 * and each element of a variadic positional argument.
 */
export function parseCLIParamValue(
  options: Readonly<ParseCLIParamValueOptions>,
): CLIParamScalarValue | undefined {
  const { cliName, inputValue, defaultValue, paramConfig } = options;
  if (inputValue === undefined && defaultValue === undefined) {
    return undefined;
  }

  return match(paramConfig)
    .with({ type: "string" }, (stringConfig) => {
      return _parseStringValue({
        cliName,
        inputValue,
        defaultValue,
        paramConfig: stringConfig,
      });
    })
    .with({ type: "number" }, (numberConfig) => {
      return _parseNumberValue({
        cliName,
        inputValue,
        defaultValue,
        paramConfig: numberConfig,
      });
    })
    .with({ type: "boolean" }, (booleanConfig) => {
      return _parseBooleanValue({
        cliName,
        inputValue,
        defaultValue,
        paramConfig: booleanConfig,
      });
    })
    .exhaustive();
}
