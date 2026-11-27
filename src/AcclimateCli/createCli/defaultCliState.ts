import type { CliState } from "../AcclimateCli.types";
import type { EmptyObject } from "type-fest";

/** The empty CLI configuration that `createCli` seeds a new CLI with. */
export const defaultCliState: Omit<
  CliState<EmptyObject, EmptyObject, EmptyObject, EmptyObject>,
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
