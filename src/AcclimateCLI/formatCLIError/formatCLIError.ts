import { generateTerminalMessage } from "@/generateTerminalMessage";
import type { CLIError } from "@/CLIError";

/**
 * Formats a `CLIError` for `stderr` output with a red error line, an indented
 * yellow recovery hint when available, and the failing command's usage text.
 *
 * Called by `executeCLI` so user input failures render cleanly without a raw
 * stack trace.
 */
export function formatCLIError(error: CLIError): string {
  const headerLines = [
    generateTerminalMessage(`|red|${error.message}|reset|`),
    error.hint !== undefined ?
      generateTerminalMessage(`  |yellow|⚠️ ${error.hint}|reset|`)
    : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });

  return error.usage === undefined ?
      headerLines.join("\n")
    : `${headerLines.join("\n")}\n\n${error.usage}`;
}
