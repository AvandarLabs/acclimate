/**
 * Builder, state, and argument-value inference types for `AcclimateCli`
 * instances.
 */
import type {
  CliCommandName,
  CliExample,
  CliFullOptionName,
  CliOptionAlias,
  CliOptionParam,
  CliPositionalParam,
  CliPositionalParamName,
  ValueOfParam,
} from "./CliParam.types";
import type { CamelCasedProperties, EmptyObject, Simplify } from "type-fest";

export type {
  CliBaseParam,
  CliBooleanParam,
  CliCommandName,
  CliExample,
  CliFullOptionName,
  CliNumberParam,
  CliOptionAlias,
  CliOptionParam,
  CliParam,
  CliParamDataType,
  CliParamScalarValue,
  CliPositionalParam,
  CliPositionalParamName,
  CliScalarPositionalParam,
  CliStringParam,
  CliVariadicBooleanParam,
  CliVariadicNumberParam,
  CliVariadicPositionalParam,
  CliVariadicStringParam,
  OutputStream,
  ValueOfParam,
} from "./CliParam.types";

type _DropNonStringKeys<T> = {
  [K in Extract<keyof T, string>]: T[K];
};

/** Utility type merging a new key-value entry into a builder type map. */
export type AddEntry<T, K extends string, V> = Simplify<
  _DropNonStringKeys<T & { [Key in K]: V }>
>;

type _FullCliParams<
  TPositionalArgs extends Record<CliPositionalParamName, CliPositionalParam>,
  TOptionArgs extends Record<CliFullOptionName, CliOptionParam>,
  TGlobalOptionArgs extends Record<CliFullOptionName, CliOptionParam>,
> = _DropNonStringKeys<TPositionalArgs & TOptionArgs & TGlobalOptionArgs>;

/** Maps a CLI's positional, local option, and global option configs to args. */
export type FullCliArgValues<
  TPositionalArgs extends Record<CliPositionalParamName, CliPositionalParam>,
  TOptionArgs extends Record<CliFullOptionName, CliOptionParam>,
  TGlobalOptionArgs extends Record<CliFullOptionName, CliOptionParam>,
> = CamelCasedProperties<{
  [K in keyof _FullCliParams<
    TPositionalArgs,
    TOptionArgs,
    TGlobalOptionArgs
  >]: ValueOfParam<
    _FullCliParams<TPositionalArgs, TOptionArgs, TGlobalOptionArgs>[K]
  >;
}>;

/** Type-erased `IAcclimateCli` accepted by `Acclimate.run` and sub-commands. */
// `any` is required: a CLI is invariant in its param records, so no narrower
// type accepts every concrete CLI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCli = IAcclimateCli<any, any, any, any>;

/** Internal immutable configuration snapshot stored by an `IAcclimateCli`. */
export type CliState<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, AnyCli> | EmptyObject,
> = {
  /** The name of the CLI. */
  name: string;

  /**
   * The aliases for options in the CLI. Keys are aliases and values are the
   * canonical name of the option.
   */
  aliases: Record<
    CliOptionAlias,
    Extract<
      keyof _DropNonStringKeys<TGlobalOptionParams & TOptionParams>,
      CliFullOptionName
    >
  >;

  /** The description of the CLI. */
  description?: string;

  /** Custom usage synopsis overriding the auto-generated synopsis line. */
  usage?: string;

  /** Worked command examples shown in generated help output. */
  examples: readonly CliExample[];

  /** The commands of the CLI. */
  commands: TCommands;

  /** The positional arguments of the CLI. */
  positionalArgs: TPositionalParams extends EmptyObject
    ? readonly CliPositionalParam[]
    : ReadonlyArray<TPositionalParams[keyof TPositionalParams]>;

  /** The named options of the CLI. */
  optionArgs: TOptionParams;

  /** The global options of the CLI. */
  globalOptionArgs: TGlobalOptionParams;

  /** The action to run when the CLI is executed. */
  action?: (
    args: Simplify<
      FullCliArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
    >,
  ) => void | Promise<void>;
};

/** Immutable fluent builder for defining an Acclimate CLI or sub-command. */
export type IAcclimateCli<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject = EmptyObject,
  TOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject = EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject = EmptyObject,
  TCommands extends Record<CliCommandName, AnyCli> | EmptyObject = EmptyObject,
> = {
  /** The internal state of the CLI. */
  state: CliState<
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
  ) => IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Override the auto-generated usage synopsis line in help output. */
  usage: (
    usage: string,
  ) => IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Add a worked example invocation displayed in help output. */
  addExample: (
    example: CliExample,
  ) => IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Set the action invoked when the CLI executes with parsed arguments. */
  action: (
    action: (
      args: Simplify<
        FullCliArgValues<TPositionalParams, TOptionParams, TGlobalOptionParams>
      >,
    ) => void | Promise<void>,
  ) => IAcclimateCli<
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
  addCommand: <C extends CliCommandName, CommandCli extends AnyCli>(
    commandName: C,
    cli: CommandCli,
  ) => IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    AddEntry<TCommands, C, CommandCli>
  >;

  /** Add a fixed or variadic positional argument to the CLI. */
  addPositionalArg: <
    PName extends CliPositionalParamName,
    P extends CliPositionalParam<PName>,
  >(
    param: P,
  ) => IAcclimateCli<
    AddEntry<TPositionalParams, P["name"], P>,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;

  /** Add a global option to the CLI that is available to all commands. */
  addGlobalOption: <const P extends CliOptionParam>(
    param: P,
  ) => IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    AddEntry<TGlobalOptionParams, P["name"], P>,
    TCommands
  >;

  /** Add a named option to the CLI. */
  addOption: <P extends CliOptionParam>(
    param: P,
  ) => IAcclimateCli<
    TPositionalParams,
    AddEntry<TOptionParams, P["name"], P>,
    TGlobalOptionParams,
    TCommands
  >;

  /** Get a command's CLI by name. */
  getCommandCli: <C extends Extract<keyof TCommands, CliCommandName>>(
    commandName: C,
  ) => C extends keyof TCommands ? TCommands[C] : never;
};
