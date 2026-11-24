import type { CLIState } from "../AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

export const defaultCLIState: Omit<
  CLIState<EmptyObject, EmptyObject, EmptyObject, EmptyObject>,
  "name"
> = {
  aliases: {},
  description: undefined,
  usage: undefined,
  examples: [],
  commands: {},
  positionalArgs: [],
  optionArgs: {},
  globalOptionArgs: {},
  action: undefined,
};
