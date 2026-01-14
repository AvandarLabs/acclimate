import { CLIError } from "@/CLIError";
import type {
  AddEntry,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
  CLIPositionalParam,
  CLIPositionalParamName,
  CLIState,
  FullCLIArgValues,
  IAcclimateCLI,
} from "./AcclimateCLI.types";
import type { EmptyObject, Simplify } from "type-fest";

export function AcclimateCLI<
  TPositionalParams extends
    | Record<CLIPositionalParamName, CLIPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CLIFullOptionName, CLIOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject,
  TCommands extends Record<CLICommandName, IAcclimateCLI> | EmptyObject,
>(
  state: CLIState<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
): IAcclimateCLI<
  TPositionalParams,
  TOptionParams,
  TGlobalOptionParams,
  TCommands
> {
  return {
    state,

    action: (
      action: (
        args: Simplify<
          FullCLIArgValues<
            TPositionalParams,
            TOptionParams,
            TGlobalOptionParams
          >
        >,
      ) => void,
    ): IAcclimateCLI<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCLI({
        ...state,
        action,
      });
    },

    description: (
      description: string,
    ): IAcclimateCLI<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      TCommands
    > => {
      return AcclimateCLI({
        ...state,
        description,
      });
    },

    addPositionalArg: <
      PName extends CLIPositionalParamName,
      P extends CLIPositionalParam<PName>,
    >(
      param: P,
    ) => {
      if (
        param.required &&
        state.positionalArgs.some((p) => {
          return !p.required;
        })
      ) {
        throw CLIError.invalidPositionalArgConfig({
          positionalArgName: param.name,
          message:
            "Required positional arguments must be before optional positional arguments",
        });
      }

      return AcclimateCLI({
        ...state,
        positionalArgs: [
          ...state.positionalArgs,
          { ...param, required: param.required ?? true },
        ],
      } as unknown as CLIState<
        AddEntry<TPositionalParams, P["name"], P>,
        TOptionParams,
        TGlobalOptionParams,
        TCommands
      >);
    },

    addGlobalOption: <P extends CLIOptionParam>(param: P) => {
      const newAliases = (param.aliases ?? []).reduce(
        (acc, alias) => {
          acc[alias] = param.name;
          return acc;
        },
        {} as Record<`-${string}` | `--${string}`, `--${string}`>,
      );
      return AcclimateCLI<
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
      } as unknown as CLIState<
        TPositionalParams,
        TOptionParams,
        AddEntry<TGlobalOptionParams, P["name"], P>,
        TCommands
      >);
    },

    addOption: <P extends CLIOptionParam>(param: P) => {
      const newAliases = (param.aliases ?? []).reduce(
        (acc, alias) => {
          acc[alias] = param.name;
          return acc;
        },
        {} as Record<`-${string}` | `--${string}`, `--${string}`>,
      );
      return AcclimateCLI<
        TPositionalParams,
        AddEntry<TOptionParams, P["name"], P>,
        TGlobalOptionParams,
        TCommands
      >({
        ...state,
        aliases: { ...state.aliases, ...newAliases },
        optionArgs: { ...state.optionArgs, [param.name]: param },
      } as unknown as CLIState<
        TPositionalParams,
        AddEntry<TOptionParams, P["name"], P>,
        TGlobalOptionParams,
        TCommands
      >);
    },

    addCommand: <C extends CLICommandName, CommandCLI extends IAcclimateCLI>(
      commandName: C,
      cli: CommandCLI,
    ): IAcclimateCLI<
      TPositionalParams,
      TOptionParams,
      TGlobalOptionParams,
      AddEntry<TCommands, C, CommandCLI>
    > => {
      return AcclimateCLI({
        ...state,
        commands: {
          ...state.commands,
          [commandName]: cli,
        },
      } as unknown as CLIState<
        TPositionalParams,
        TOptionParams,
        TGlobalOptionParams,
        AddEntry<TCommands, C, CommandCLI>
      >);
    },

    getCommandCLI: <C extends Extract<keyof TCommands, CLICommandName>>(
      commandName: C,
    ): C extends keyof TCommands ? TCommands[C] : never => {
      const cmd = state.commands[commandName];
      if (!cmd) {
        throw CLIError.unknownCommand({
          commandName,
          message: `Command "${commandName}" not found`,
        });
      }
      return cmd as C extends keyof TCommands ? TCommands[C] : never;
    },
  };
}
