import type { CamelCasedProperties, EmptyObject, Simplify } from "type-fest";

export type CLIParamDataType = string | number | boolean | undefined;

export type CLIPositionalParamName = string;
export type CLICommandName = string;
export type CLIFullOptionName = `--${string}`;
export type CLIOptionAlias = `--${string}` | `-${string}`;
type _DropNonStringKeys<T> = {
  [K in Extract<keyof T, string>]: T[K];
};
export type AddEntry<T, K extends string, V> = Simplify<
  _DropNonStringKeys<T & { [Key in K]: V }>
>;

type _FullCLIParams<
  TPositionalArgs extends Record<CLIPositionalParamName, CLIPositionalParam>,
  TOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
  TGlobalOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
> = _DropNonStringKeys<TPositionalArgs & TOptionArgs & TGlobalOptionArgs>;

export type ValueOfParam<T extends CLIParam> =
  T extends CLIStringParam<string, infer PValue> ? PValue
  : T extends CLINumberParam<string, infer PValue> ? PValue
  : T extends CLIBooleanParam<string> ? boolean
  : never;

export type FullCLIArgValues<
  TPositionalArgs extends Record<CLIPositionalParamName, CLIPositionalParam>,
  TOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
  TGlobalOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
> = CamelCasedProperties<{
  [K in keyof _FullCLIParams<
    TPositionalArgs,
    TOptionArgs,
    TGlobalOptionArgs
  >]: ValueOfParam<
    _FullCLIParams<TPositionalArgs, TOptionArgs, TGlobalOptionArgs>[K]
  >;
}>;

type CLIBaseParam<PName extends string> = {
  /**
   * The name of the param.
   */
  name: PName;

  /**
   * The description of the option.
   */
  description?: string;

  /**
   * Whether to ask the user for a value if the input is empty by entering
   * into an interactive prompt and waiting for a user's input.
   *
   * If `true`, a default message will be presented to the user. Otherwise,
   * if a `{ message }` object is provided, the custom message will be presented
   * to the user.
   */
  askIfEmpty?:
    | boolean
    | {
        message: string;
      };
};

export type CLIStringParam<
  PName extends string,
  PValue extends string = string,
> = CLIBaseParam<PName> & {
  type: "string";
  choices?: PValue[];

  /**
   * The default value of the option.
   * If `required` is true, the `defaultValue` is ignored, because the user
   * must always provide a value.
   */
  defaultValue?: PValue;

  /**
   * A custom validator function to apply on the parsed value.
   * For example, this is where we might want to check if a value is of the
   * expected format or if it is within a certain range.
   *
   * Returning anything other than `true` will be treated as an error message.
   *
   * If `false` then a generic error message will be used. Otherwise, if a
   * string is returned, then that will be used as the error message.
   * @default undefined
   */
  validator?: (value: PValue) => boolean | string;

  /**
   * Parses the raw string input into the expected data type.
   *
   * If not provided, the default parser will return the value as is.
   *
   * @param value - The value to parse.
   * @returns The parsed value.
   */
  parser?: (value: string) => PValue;
};

export type CLINumberParam<
  PName extends string,
  T extends number = number,
> = CLIBaseParam<PName> & {
  type: "number";
  choices?: T[];

  /**
   * The default value of the option.
   * If `required` is true, the `defaultValue` is ignored, because the user
   * must always provide a value.
   */
  defaultValue?: T;

  /**
   * A custom validator function to apply on the parsed value.
   * For example, this is where we might want to check if a value is of the
   * expected format or if it is within a certain range.
   *
   * Returning anything other than `true` will be treated as an error message.
   *
   * If `false` then a generic error message will be used. Otherwise, if a
   * string is returned, then that will be used as the error message.
   * @default undefined
   */
  validator?: (value: T) => boolean | string;

  /**
   * Parses the raw string input into the expected data type.
   *
   * If not provided, the default parser will call `Number.parseInt(value, 10)`.
   *
   * @param value - The value to parse.
   * @returns The parsed value.
   */
  parser?: (value: string) => T;
};

export type CLIBooleanParam<PName extends string> = CLIBaseParam<PName> & {
  type: "boolean";

  /**
   * The default value of the option.
   * If `required` is true, the `defaultValue` is ignored, because the user
   * must always provide a value.
   */
  defaultValue?: boolean;

  /**
   * A custom validator function to apply on the parsed value.
   * For example, this is where we might want to check if a value is of the
   * expected format or if it is within a certain range.
   *
   * Returning anything other than `true` will be treated as an error message.
   *
   * If `false` then a generic error message will be used. Otherwise, if a
   * string is returned, then that will be used as the error message.
   * @default undefined
   */
  validator?: (value: boolean) => boolean | string;

  /**
   * Parses the raw string input into the expected data type.
   *
   * If not provided, the default parser will treat the string "false" as false
   * and any other value as true. This means that empty strings are treated
   * as true, which is what allows booleans to be parsed as flags by default
   * (without having to explicitly set "true").
   *
   * @param value - The value to parse.
   * @returns The parsed value.
   */
  parser?: (value: string) => boolean;
};

export type CLIParam<PName extends string = string> =
  | CLIStringParam<PName>
  | CLINumberParam<PName>
  | CLIBooleanParam<PName>;

export type CLIPositionalParam<PName extends string = string> =
  CLIParam<PName> & {
    /**
     * Whether the parameter is required.
     *
     * Positional arguments can only be optional if they are not followed by any
     * required positional arguments.
     *
     * @default true
     */
    required: boolean;
  };

export type CLIOptionParam<
  PName extends CLIFullOptionName = CLIFullOptionName,
> = CLIParam<PName> & {
  /**
   * The aliases of the positional argument.
   * Aliases must start with `-` or `--` and must be unique within the CLI.
   */
  aliases?: readonly CLIOptionAlias[];

  /**
   * Whether the parameter is required.
   * @default false
   */
  required: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCLI = IAcclimateCLI<any, any, any, any>;

export type CLIState<
  TPositionalParams extends
    | Record<CLIPositionalParamName, CLIPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CLIFullOptionName, CLIOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject,
  TCommands extends Record<CLICommandName, AnyCLI> | EmptyObject,
> = {
  /** The name of the CLI. */
  name: string;

  /**
   * The aliases for options in the CLI. Keys are aliases and values are the
   * canonical name of the option.
   */
  aliases: Record<
    CLIOptionAlias,
    Extract<keyof TGlobalOptionParams | keyof TOptionParams, CLIFullOptionName>
  >;

  /** The description of the CLI. */
  description?: string;

  /** The commands of the CLI. */
  commands: TCommands;

  /** The positional arguments of the CLI. */
  positionalArgs: TPositionalParams extends EmptyObject ?
    readonly CLIPositionalParam[]
  : ReadonlyArray<TPositionalParams[keyof TPositionalParams]>;

  /** The named options of the CLI. */
  optionArgs: TOptionParams;

  /** The global options of the CLI. */
  globalOptionArgs: TGlobalOptionParams;

  /** The action to run when the CLI is executed. */
  action: (
    args: Simplify<
      FullCLIArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
    >,
  ) => void;
};

export type IAcclimateCLI<
  TPositionalParams extends
    | Record<CLIPositionalParamName, CLIPositionalParam>
    | EmptyObject = EmptyObject,
  TOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject = EmptyObject,
  TGlobalOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject = EmptyObject,
  TCommands extends Record<CLICommandName, AnyCLI> | EmptyObject = EmptyObject,
> = {
  /** The internal state of the CLI. */
  state: CLIState<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Set the description of the CLI. */
  description: (
    description: string,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  action: (
    action: (
      args: Simplify<
        FullCLIArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
      >,
    ) => void,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /**
   * Add a sub-command to the CLI. A command is essentially a nested CLI.
   *
   * If the first positional argument is a command, then Acclimate will parse
   * all subsequent arguments with that command's CLI.
   */
  addCommand: <
    C extends CLICommandName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CommandCLI extends IAcclimateCLI<any, any, any, any>,
  >(
    commandName: C,
    cli: CommandCLI,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    AddEntry<TCommands, C, CommandCLI>
  >;

  /** Add a positional argument to the CLI. */
  addPositionalArg: <
    PName extends CLIPositionalParamName,
    P extends CLIPositionalParam<PName>,
  >(
    param: P,
  ) => IAcclimateCLI<
    AddEntry<TPositionalParams, P["name"], P>,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Add a global option to the CLI that is available to all commands. */
  addGlobalOption: <const P extends CLIOptionParam>(
    param: P,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    AddEntry<TGlobalOptionParams, P["name"], P>,
    TCommands
  >;

  /** Add a named option to the CLI. */
  addOption: <P extends CLIOptionParam>(
    param: P,
  ) => IAcclimateCLI<
    TPositionalParams,
    AddEntry<TOptionParams, P["name"], P>,
    TGlobalOptionParams,
    TCommands
  >;

  /** Get a command's CLI by name. */
  getCommandCLI: <C extends Extract<keyof TCommands, CLICommandName>>(
    commandName: C,
  ) => C extends keyof TCommands ? TCommands[C] : never;
};
