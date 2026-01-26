import { createCLI } from "./AcclimateCLI";
import { runCLI } from "./AcclimateCLI/runCLI/runCLI";
import { generateTerminalMessage } from "./generateTerminalMessage";
import { requestTerminalInput } from "./requestTerminalInput";
import type { AnyCLI, IAcclimateCLI } from "./AcclimateCLI/AcclimateCLI.types";

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
  run: (cli: AnyCLI) => void;

  /**
   * Outputs a message with `console.log`.
   * Supports interpolation using `$varName$` as tokens.
   *
   * Colors can be changed within a message `|<COLOR_NAME>|` tokens.
   * Supported colors are:
   * - black
   * - red
   * - green
   * - yellow
   * - blue
   * - magenta
   * - cyan
   * - white
   * - bright_black|gray|grey
   * - bright_red
   * - bright_green
   * - bright_yellow
   * - bright_blue
   * - bright_magenta
   * - bright_cyan
   * - bright_white
   *
   * The color remains active until another color token is found,
   * or if |reset| is found (which resets the terminal color to the default).
   *
   * @example
   *
   * Acclimate.log("Hello $name$", { name: "Pablo" });
   * // "Hello Pablo"
   *
   * Acclimate.log("|red|Error:|reset| There was an error.")
   * // "Error: There was an error."
   * // ^ the "Error:" portion will be red
   *
   */
  log: (message: string, params?: Record<string, string | undefined>) => void;

  /**
   * Prompt the user for interactive input in the terminal.
   *
   * @param options - Prompt configuration.
   * @returns The user's response, or undefined when left empty and optional.
   */
  requestInput: (options: {
    message: string;
    params: Record<string, string>;
    responseOptions: {
      required: boolean;
      type?: "string" | "number" | "boolean";

      /*
       * Default value to use if the user enters an empty response.
       *
       * If the option is `required` and the user doesn't supply a value, we will
       * not show an error if there is a `defaultValue` we can use.
       */
      defaultValue?: string | number | boolean;
    };
  }) => Promise<string | undefined>;
};

export const Acclimate: Acclimate = {
  createCLI,
  run: (cli: AnyCLI) => {
    void runCLI({ cli, input: process.argv.slice(2) });
  },
  log: (message: string, params: Record<string, string | undefined> = {}) => {
    console.log(generateTerminalMessage(message, params));
  },
  requestInput: (options) => {
    return requestTerminalInput(options);
  },
};
