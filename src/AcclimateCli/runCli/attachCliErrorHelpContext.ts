import { generateHelpText } from "@/AcclimateCli/generateHelpText/generateHelpText";
import type { AnyCli } from "@/AcclimateCli/AcclimateCli.types";
import type { CliError } from "@/CliError";
import type { SemanticTheme } from "@/theme/theme.types";

/**
 * Enriches a `CliError` with the matched command path, actionable `--help`
 * recovery hint, and formatted usage text for `stderr` reporting.
 *
 * Called by `tokenizeCliInput` and `runCli` whenever argument tokenization or
 * parameter validation fails on a resolved command.
 */
export function attachCliErrorHelpContext(options: {
  cli: AnyCli;
  commandPath: readonly string[];
  error: CliError;
  theme?: SemanticTheme;
}): CliError {
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
