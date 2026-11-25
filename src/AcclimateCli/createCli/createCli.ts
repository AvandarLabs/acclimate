import { AcclimateCli } from "../AcclimateCli";
import { defaultCliState } from "./defaultCliState";
import type { IAcclimateCli } from "../AcclimateCli.types";
import type { EmptyObject } from "type-fest";

/**
 * Builder function to create a new CLI instance with a given name.
 *
 * @param name - The name of the CLI.
 * @returns A new CLI instance.
 */
export function createCli(
  name: string,
): IAcclimateCli<EmptyObject, EmptyObject, EmptyObject, EmptyObject> {
  return AcclimateCli({ ...defaultCliState, name });
}
