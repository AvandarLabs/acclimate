import { createCLI } from "./AcclimateCLI";
import { runCLI } from "./AcclimateCLI/runCLI/runCLI";
import type { IAcclimateCLI } from "./AcclimateCLI/AcclimateCLI.types";

type Acclimate = {
  /**
   * Create a new Acclimate CLI instance.
   *
   * @param name - The name of the CLI.
   * @returns A new CLI instance.
   */
  createCLI: (name: string) => IAcclimateCLI;

  /**
   * Run a CLI instance.
   *
   * It can only be run once. Calling any other methods after `.run()` will
   * throw an error.
   *
   * @param cli - The CLI instance to run.
   */
  run: (cli: IAcclimateCLI) => void;
};

export const Acclimate: Acclimate = {
  createCLI,
  run: (cli: IAcclimateCLI) => {
    runCLI({ cli, input: process.argv.slice(2) });
  },
};
