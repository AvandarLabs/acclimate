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
      code: "missing_option_value";
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

/** Machine-readable error code reported by `CLIError` instances. */
export type CLIErrorCode = CLIErrorInfo["code"];

type CLIErrorOptions = {
  cliName: string;
  message: string;
  commandPath?: readonly string[];
  hint?: string;
  usage?: string;
} & CLIErrorInfo;

/**
 * Structured error thrown when CLI configuration, argument parsing, or value
 * validation fails. Callers can inspect `error.code` to branch on the failure
 * kind without matching formatted message strings.
 */
export class CLIError extends Error {
  /** Machine-readable code identifying the CLI failure category. */
  readonly code: CLIErrorCode;

  /** Display name or invocation path of the CLI that failed. */
  readonly cliName: string;

  /** Invocation token path leading to the failing command, when known. */
  readonly commandPath: string[] | undefined;

  /** Actionable recovery hint for stderr output, when available. */
  readonly hint: string | undefined;

  /** Rendered usage text for the failing command, when available. */
  readonly usage: string | undefined;

  private readonly _options: CLIErrorOptions;

  /** Build an error when a parsed parameter value fails validation. */
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

  /** Build an error when a required option is not supplied. */
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

  /** Build an error when a value-taking option is passed without a value. */
  static missingOptionValue(options: {
    cliName: string;
    optionName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ?? `Option "${options.optionName}" requires a value`,
      code: "missing_option_value",
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

  /** Build an error when an unrecognized option flag is supplied. */
  static unknownOption(options: {
    cliName: string;
    optionName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? `Unknown option "${options.optionName}"`,
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

  static alreadyRun(options: { cliName: string; message?: string }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message: options.message ?? "CLI has already been run",
      code: "already_run",
      details: undefined,
    });
  }

  constructor(options: CLIErrorOptions) {
    super(`❌ Error running ${options.cliName}: ${options.message}`);
    this.code = options.code;
    this.cliName = options.cliName;
    this.commandPath =
      options.commandPath !== undefined ? [...options.commandPath] : undefined;
    this.hint = options.hint;
    this.usage = options.usage;
    this._options = options;
  }

  /**
   * Return a new `CLIError` with command path, recovery hint, and usage text
   * attached for user-facing `stderr` rendering. Called by
   * `attachCLIErrorHelpContext` when a CLI failure occurs on a resolved
   * command.
   */
  withHelpContext(
    context: Readonly<{
      commandPath: readonly string[];
      hint: string;
      usage: string;
    }>,
  ): CLIError {
    const commandLabel = context.commandPath.join(" ");
    return new CLIError({
      ...this._options,
      cliName: commandLabel || this.cliName,
      commandPath: [...context.commandPath],
      hint: context.hint,
      usage: context.usage,
    });
  }
}
