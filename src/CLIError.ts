import type { CLIParamDataType } from "./AcclimateCLI/AcclimateCLI.types";

type CLIErrorInfo =
  | {
      code: "already_run";
      details: undefined;
    }
  | {
      code: "unknown_command";
      details: { commandName: string };
    }
  | {
      code: "invalid_positional_arg_config";
      details: { positionalArgName: string };
    }
  | {
      code: "too_many_positional_args";
      details: { count: number };
    }
  | {
      code: "missing_required_positional_arg";
      details: { positionalArgName: string };
    }
  | {
      code: "missing_required_option";
      details: { optionName: string };
    }
  | {
      code: "unknown_option";
      details: {
        optionName: string;
      };
    }
  | {
      code: "invalid_cli_param_value";
      details: {
        paramName: string;
        paramValue: CLIParamDataType;
      };
    }
  | { code: "unknown_error"; details: undefined };

type CLIErrorOptions = { cliName: string; message: string } & CLIErrorInfo;

export class CLIError extends Error {
  static invalidCLIParamValue(options: {
    cliName: string;
    paramName: string;
    paramValue: CLIParamDataType;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ?? `Invalid value for CLI param "${options.paramName}"`,
      code: "invalid_cli_param_value",
      details: { paramName: options.paramName, paramValue: options.paramValue },
    });
  }
  static missingRequiredOption(options: {
    cliName: string;
    optionName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ?? `Required option "${options.optionName}" is missing`,
      code: "missing_required_option",
      details: { optionName: options.optionName },
    });
  }

  static missingRequiredPositionalArg(options: {
    cliName: string;
    positionalArgName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ??
        `Required positional argument "${options.positionalArgName}" is missing`,
      code: "missing_required_positional_arg",
      details: { positionalArgName: options.positionalArgName },
    });
  }

  static unknownOption(options: {
    cliName: string;
    optionName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? `Option "${options.optionName}" not found`,
      code: "unknown_option",
      details: { optionName: options.optionName },
    });
  }

  static tooManyPositionalArgs(options: {
    cliName: string;
    count: number;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? "Too many positional arguments provided.",
      code: "too_many_positional_args",
      details: { count: options.count },
    });
  }

  static invalidPositionalArgConfig(options: {
    cliName: string;
    positionalArgName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ??
        `Positional argument configuration for "${options.positionalArgName}" is invalid`,
      code: "invalid_positional_arg_config",
      details: { positionalArgName: options.positionalArgName },
    });
  }

  static unknownCommand(options: {
    cliName: string;
    commandName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? `Command "${options.commandName}" not found`,
      code: "unknown_command",
      details: { commandName: options.commandName },
    });
  }

  static alreadyRun(options: {
    cliName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? "CLI has already been run",
      code: "already_run",
      details: undefined,
    });
  }

  constructor(options: CLIErrorOptions) {
    super(`❌ Error running ${options.cliName}: ${options.message}`);
  }
}
