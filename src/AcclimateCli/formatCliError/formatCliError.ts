import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import { stripAnsi } from "@/theme/stripAnsi/stripAnsi";
import type { CliError } from "@/CliError";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";
import type { ThemeInput } from "@/theme/theme.types";

type FormatCliErrorOptions = {
  color?: boolean;
  theme?: ThemeInput;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};

/**
 * Formats a `CliError` for `stderr` output using Acclimate's semantic theme
 * (`error` for the headline, `warning` for the indented `⚠️` recovery hint)
 * and appends the command usage sanitized to plain text when color is disabled.
 *
 * Called by `executeCli` so user input failures render cleanly without a raw
 * stack trace.
 */
export function formatCliError(
  error: CliError,
  options: Readonly<FormatCliErrorOptions> = {},
): string {
  const theme = makeThemeFromOptions({
    theme: options.theme,
    color: options.color,
    stream: options.stream,
    isTTY: options.isTTY,
    env: options.env,
    defaultColor: true,
  });

  const headerLines = [
    theme.error(error.message),
    error.hint !== undefined
      ? `  ${theme.warning(`⚠️ ${error.hint}`)}`
      : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });

  const usageBlock =
    error.usage === undefined
      ? undefined
      : theme.isColorEnabled
        ? error.usage
        : stripAnsi(error.usage);

  return usageBlock === undefined
    ? headerLines.join("\n")
    : `${headerLines.join("\n")}\n\n${usageBlock}`;
}
