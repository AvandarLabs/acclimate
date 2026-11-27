import { CliError } from "@/CliError";
import type {
  AddEntry,
  CliCommandName,
  CliFullOptionName,
  CliOptionParam,
  CliPositionalParam,
  CliPositionalParamName,
  CliState,
  IAcclimateCli,
} from "./AcclimateCli.types";
import type { EmptyObject } from "type-fest";

/** Builds the alias-to-full-name lookup that one option declares. */
function _buildAliasLookupFromParam(
  param: Readonly<CliOptionParam>,
): Record<`-${string}` | `--${string}`, `--${string}`> {
  const aliasLookup: Record<`-${string}` | `--${string}`, `--${string}`> = {};
  (param.aliases ?? []).forEach((alias) => {
    aliasLookup[alias] = param.name;
  });
  return aliasLookup;
}

/** Throws when a new positional argument would break ordering rules. */
function _assertPositionalArgAllowed(
  state: Readonly<{
    name: string;
    positionalArgs: readonly CliPositionalParam[];
  }>,
  param: Readonly<CliPositionalParam>,
): void {
  const cliName = state.name;
  const existingVariadicArg = state.positionalArgs.find((existingParam) => {
    return existingParam.variadic === true;
  });
  if (existingVariadicArg) {
    throw CliError.invalidPositionalArgConfig({
      cliName,
      positionalArgName: param.name,
      message: `Variadic positional argument "${existingVariadicArg.name}" must be the last positional argument`,
    });
  }

  const hasOptionalPositionalArg = state.positionalArgs.some(
    (existingParam) => {
      return !existingParam.required;
    },
  );
  if (param.required && hasOptionalPositionalArg) {
    throw CliError.invalidPositionalArgConfig({
      cliName,
      positionalArgName: param.name,
      message:
        "Required positional arguments must be before optional positional arguments",
    });
  }
}

type _State<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
> = CliState<TPositionalParams, TOptionParams, TGlobalOptionParams, TCommands>;

/** Returns a CLI that also accepts the given positional argument. */
function _addPositionalArg<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
  P extends CliPositionalParam,
>(
  state: _State<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  param: P,
): IAcclimateCli<
  AddEntry<TPositionalParams, P["name"], P>,
  TOptionParams,
  TGlobalOptionParams,
  TCommands
> {
  _assertPositionalArgAllowed(state, param);
  // The widened state only gains `param` under its own name, which the
  // `AddEntry` type tracks but a computed key cannot express.
  return AcclimateCli<
    AddEntry<TPositionalParams, P["name"], P>,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >({
    ...state,
    positionalArgs: [
      ...state.positionalArgs,
      { ...param, required: param.required ?? true },
    ],
  } as unknown as _State<
    AddEntry<TPositionalParams, P["name"], P>,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >);
}

/** Returns a CLI that also accepts the given global option. */
function _addGlobalOption<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
  P extends CliOptionParam,
>(
  state: _State<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  param: P,
): IAcclimateCli<
  TPositionalParams,
  TOptionParams,
  AddEntry<TGlobalOptionParams, P["name"], P>,
  TCommands
> {
  // Same computed-key limitation as `_addPositionalArg`.
  return AcclimateCli<
    TPositionalParams,
    TOptionParams,
    AddEntry<TGlobalOptionParams, P["name"], P>,
    TCommands
  >({
    ...state,
    aliases: { ...state.aliases, ..._buildAliasLookupFromParam(param) },
    globalOptionArgs: { ...state.globalOptionArgs, [param.name]: param },
  } as unknown as _State<
    TPositionalParams,
    TOptionParams,
    AddEntry<TGlobalOptionParams, P["name"], P>,
    TCommands
  >);
}

/** Returns a CLI that also accepts the given option. */
function _addOption<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
  P extends CliOptionParam,
>(
  state: _State<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  param: P,
): IAcclimateCli<
  TPositionalParams,
  AddEntry<TOptionParams, P["name"], P>,
  TGlobalOptionParams,
  TCommands
> {
  // Same computed-key limitation as `_addPositionalArg`.
  return AcclimateCli<
    TPositionalParams,
    AddEntry<TOptionParams, P["name"], P>,
    TGlobalOptionParams,
    TCommands
  >({
    ...state,
    aliases: { ...state.aliases, ..._buildAliasLookupFromParam(param) },
    optionArgs: { ...state.optionArgs, [param.name]: param },
  } as unknown as _State<
    TPositionalParams,
    AddEntry<TOptionParams, P["name"], P>,
    TGlobalOptionParams,
    TCommands
  >);
}

/** Returns a CLI that also routes the given command name to a sub-CLI. */
function _addCommand<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
  C extends CliCommandName,
  CommandCli extends IAcclimateCli,
>(
  state: _State<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  commandName: C,
  cli: CommandCli,
): IAcclimateCli<
  TPositionalParams,
  TOptionParams,
  TGlobalOptionParams,
  AddEntry<TCommands, C, CommandCli>
> {
  // Same computed-key limitation as `_addPositionalArg`.
  return AcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    AddEntry<TCommands, C, CommandCli>
  >({
    ...state,
    commands: { ...state.commands, [commandName]: cli },
  } as unknown as _State<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    AddEntry<TCommands, C, CommandCli>
  >);
}

/** Returns the sub-CLI registered under `commandName` or throws. */
function _getCommandCli<
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
  C extends Extract<keyof TCommands, CliCommandName>,
>(
  state: Readonly<{ name: string; commands: Readonly<TCommands> }>,
  commandName: C,
): C extends keyof TCommands ? TCommands[C] : never {
  const commandCli = (state.commands as Record<string, IAcclimateCli>)[
    commandName
  ];
  if (!commandCli) {
    throw CliError.unknownCommand({
      cliName: state.name,
      commandName,
      message: `Command "${commandName}" not found`,
    });
  }
  // `commands` is keyed by string, so the lookup type cannot narrow to
  // the command registered under `C`.
  return commandCli as C extends keyof TCommands ? TCommands[C] : never;
}

/**
 * Creates an immutable CLI builder around a configuration snapshot. Every
 * builder method returns a new CLI and leaves the receiver unchanged.
 *
 * @param state - The configuration snapshot the CLI wraps.
 * @returns A CLI whose methods derive new CLIs from `state`.
 */
export function AcclimateCli<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, IAcclimateCli> | EmptyObject,
>(
  state: CliState<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
): IAcclimateCli<
  TPositionalParams,
  TOptionParams,
  TGlobalOptionParams,
  TCommands
> {
  type Self = IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >;
  const withState = (patch: Partial<typeof state>): Self => {
    return AcclimateCli({ ...state, ...patch });
  };

  return {
    state,

    getName: () => {
      return state.name;
    },

    action: (action) => {
      return withState({ action });
    },

    description: (description) => {
      return withState({ description });
    },

    usage: (usage) => {
      return withState({ usage });
    },

    addExample: (example) => {
      return withState({ examples: [...state.examples, example] });
    },

    addPositionalArg: (param) => {
      return _addPositionalArg<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        TCommands,
        typeof param
      >(state, param);
    },

    addGlobalOption: (param) => {
      return _addGlobalOption<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        TCommands,
        typeof param
      >(state, param);
    },

    addOption: (param) => {
      return _addOption<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        TCommands,
        typeof param
      >(state, param);
    },

    addCommand: (commandName, cli) => {
      return _addCommand<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        TCommands,
        typeof commandName,
        typeof cli
      >(state, commandName, cli);
    },

    getCommandCli: (commandName) => {
      return _getCommandCli<TCommands, typeof commandName>(state, commandName);
    },
  };
}
