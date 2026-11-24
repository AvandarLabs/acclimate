import { generateHelpText } from "@/AcclimateCLI/generateHelpText/generateHelpText";
import type { AnyCLI } from "@/AcclimateCLI/AcclimateCLI.types";
import type { CLIError } from "@/CLIError";
import type { SemanticTheme } from "@/theme/theme.types";

/**
 * Enriches a `CLIError` with the matched command path, actionable `--help`
 * recovery hint, and formatted usage text for `stderr` reporting.
 *
 * Called by `tokenizeCLIInput` and `runCLI` whenever argument tokenization or
 * parameter validation fails on a resolved command.
 */
export function attachCLIErrorHelpContext(options: {
  cli: AnyCLI;
  commandPath: readonly string[];
  error: CLIError;
  theme?: SemanticTheme;
}): CLIError {
  if (options.error.code === "prompt_cancelled") {
    return options.error.withHelpContext({
      commandPath: options.commandPath,
      hint: options.error.hint,
      usage: undefined,
    });
  }

  const commandLabel = options.commandPath.join(" ");
  return options.error.withHelpContext({
    commandPath: options.commandPath,
    hint:
      options.error.hint ??
      `Run ${commandLabel} --help to see available options and usage.`,
    usage: generateHelpText(options.cli, {
      commandPath: options.commandPath,
      theme: options.theme,
    }),
  });
}
