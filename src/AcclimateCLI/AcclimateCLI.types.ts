/**
 * Builder, state, and argument-value inference types for `AcclimateCLI`
 * instances.
 */
import type {
  CLICommandName,
  CLIExample,
  CLIFullOptionName,
  CLIOptionAlias,
  CLIOptionParam,
  CLIPositionalParam,
  CLIPositionalParamName,
  ValueOfParam,
} from "./CLIParam.types";
import type { CamelCasedProperties, EmptyObject, Simplify } from "type-fest";

export type {
  CLIBaseParam,
  CLIBooleanParam,
  CLICommandName,
  CLIExample,
  CLIFullOptionName,
  CLINumberParam,
  CLIOptionAlias,
  CLIOptionParam,
  CLIParam,
  CLIParamDataType,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIPositionalParamName,
  CLIScalarPositionalParam,
  CLIStringParam,
  CLIVariadicBooleanParam,
  CLIVariadicNumberParam,
  CLIVariadicPositionalParam,
  CLIVariadicStringParam,
  OutputStream,
  ValueOfParam,
} from "./CLIParam.types";

type _DropNonStringKeys<T> = {
  [K in Extract<keyof T, string>]: T[K];
};

/** Utility type merging a new key-value entry into a builder type map. */
export type AddEntry<T, K extends string, V> = Simplify<
  _DropNonStringKeys<T & { [Key in K]: V }>
>;

type _FullCLIParams<
  TPositionalArgs extends Record<CLIPositionalParamName, CLIPositionalParam>,
  TOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
  TGlobalOptionArgs extends Record<CLIFullOptionName, CLIOptionParam>,
> = _DropNonStringKeys<TPositionalArgs & TOptionArgs & TGlobalOptionArgs>;

/** Maps a CLI's positional, local option, and global option configs to args. */
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

/** Type-erased `IAcclimateCLI` accepted by `Acclimate.run` and sub-commands. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCLI = IAcclimateCLI<any, any, any, any>;

/** Internal immutable configuration snapshot stored by an `IAcclimateCLI`. */
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
    Extract<
      keyof _DropNonStringKeys<TGlobalOptionParams & TOptionParams>,
      CLIFullOptionName
    >
  >;

  /** The description of the CLI. */
  description?: string;

  /** Custom usage synopsis overriding the auto-generated synopsis line. */
  usage?: string;

  /** Worked command examples shown in generated help output. */
  examples: readonly CLIExample[];

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
  action?: (
    args: Simplify<
      FullCLIArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
    >,
  ) => void | Promise<void>;
};

/** Immutable fluent builder for defining an Acclimate CLI or sub-command. */
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

  /** Get the CLI name. */
  getName: () => string;

  /** Set the description of the CLI. */
  description: (
    description: string,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Override the auto-generated usage synopsis line in help output. */
  usage: (
    usage: string,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Add a worked example invocation displayed in help output. */
  addExample: (
    example: CLIExample,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Set the action invoked when the CLI executes with parsed arguments. */
  action: (
    action: (
      args: Simplify<
        FullCLIArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
      >,
    ) => void | Promise<void>,
  ) => IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /**
   * Add a sub-command to the CLI. A command is essentially a nested CLI.
   *
   * If the first positional argument before `--` matches a command, Acclimate
   * parses all subsequent arguments with that command's CLI.
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

  /** Add a fixed or variadic positional argument to the CLI. */
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
