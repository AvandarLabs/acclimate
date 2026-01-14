import { AcclimateCLI } from "../AcclimateCLI";
import { defaultCLIState } from "./defaultCLIState";
import type { IAcclimateCLI } from "../AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

/**
 * Builder function to create a new CLI instance with a given name.
 *
 * @param name - The name of the CLI.
 * @returns A new CLI instance.
 */
export function createCLI(
  name: string,
): IAcclimateCLI<EmptyObject, EmptyObject, EmptyObject, EmptyObject> {
  return AcclimateCLI({ ...defaultCLIState, name });
}
