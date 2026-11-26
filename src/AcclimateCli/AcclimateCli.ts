import { CliError } from "@/CliError";
import type {
  AddEntry,
  CliCommandName,
  CliExample,
  CliFullOptionName,
  CliOptionParam,
  CliPositionalParam,
  CliPositionalParamName,
  CliState,
  FullCliArgValues,
  IAcclimateCli,
} from "./AcclimateCli.types";
import type { EmptyObject, Simplify } from "type-fest";

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
  const cliName = state.name;
  return {
    state,

    getName: () => {
      return cliName;
    },

    action: (
      action: (
        args: Simplify<
          FullCliArgValues<
            TPositionalParams,
            TOptionParams,
            TGlobalOptionParams
          >
        >,
      ) => void | Promise<void>,
    ): IAcclimateCli<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCli({
        ...state,
        action,
      });
    },

    description: (
      description: string,
    ): IAcclimateCli<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCli({
        ...state,
        description,
      });
    },

    usage: (
      usage: string,
    ): IAcclimateCli<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCli({
        ...state,
        usage,
      });
    },

    addExample: (
      example: CliExample,
    ): IAcclimateCli<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCli({
        ...state,
        examples: [...state.examples, example],
      });
    },

    addPositionalArg: <
      PName extends CliPositionalParamName,
      P extends CliPositionalParam<PName>,
    >(
      param: P,
    ) => {
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

      if (
        param.required &&
        state.positionalArgs.some((existingParam) => {
          return !existingParam.required;
        })
      ) {
        throw CliError.invalidPositionalArgConfig({
          cliName,
          positionalArgName: param.name,
          message:
            "Required positional arguments must be before optional positional arguments",
        });
      }

      return AcclimateCli({
        ...state,
        positionalArgs: [
          ...state.positionalArgs,
          { ...param, required: param.required ?? true },
        ],
      } as unknown as CliState<
        AddEntry<TPositionalParams, P["name"], P>,
        TOptionParams,
        TGlobalOptionParams,
        TCommands
      >);
    },

    addGlobalOption: <P extends CliOptionParam>(param: P) => {
      const newAliases = (param.aliases ?? []).reduce(
        (acc, alias) => {
          acc[alias] = param.name;
          return acc;
        },
        {} as Record<`-${string}` | `--${string}`, `--${string}`>,
      );
      return AcclimateCli<
        TPositionalParams,
        TOptionParams,
        AddEntry<TGlobalOptionParams, P["name"], P>,
        TCommands
      >({
        ...state,
        aliases: { ...state.aliases, ...newAliases },
        globalOptionArgs: {
          ...state.globalOptionArgs,
          [param.name]: param,
        },
      } as unknown as CliState<
        TPositionalParams,
        TOptionParams,
        AddEntry<TGlobalOptionParams, P["name"], P>,
        TCommands
      >);
    },

    addOption: <P extends CliOptionParam>(param: P) => {
      const newAliases = (param.aliases ?? []).reduce(
        (acc, alias) => {
          acc[alias] = param.name;
          return acc;
        },
        {} as Record<`-${string}` | `--${string}`, `--${string}`>,
      );
      return AcclimateCli<
        TPositionalParams,
        AddEntry<TOptionParams, P["name"], P>,
        TGlobalOptionParams,
        TCommands
      >({
        ...state,
        aliases: { ...state.aliases, ...newAliases },
        optionArgs: { ...state.optionArgs, [param.name]: param },
      } as unknown as CliState<
        TPositionalParams,
        AddEntry<TOptionParams, P["name"], P>,
        TGlobalOptionParams,
        TCommands
      >);
    },

    addCommand: <C extends CliCommandName, CommandCli extends IAcclimateCli>(
      commandName: C,
      cli: CommandCli,
    ): IAcclimateCli<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      AddEntry<TCommands, C, CommandCli>
    > => {
      return AcclimateCli({
        ...state,
        commands: {
          ...state.commands,
          [commandName]: cli,
        },
      } as unknown as CliState<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        AddEntry<TCommands, C, CommandCli>
      >);
    },

    getCommandCli: <C extends Extract<keyof TCommands, CliCommandName>>(
      commandName: C,
    ): C extends keyof TCommands ? TCommands[C] : never => {
      const cmd = state.commands[commandName];
      if (!cmd) {
        throw CliError.unknownCommand({
          cliName,
          commandName,
          message: `Command "${commandName}" not found`,
        });
      }
      return cmd as C extends keyof TCommands ? TCommands[C] : never;
    },
  };
}
