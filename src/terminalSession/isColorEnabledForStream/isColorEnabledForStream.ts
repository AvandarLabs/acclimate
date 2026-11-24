import type { TerminalOutputStream } from "../terminalSession.types";

/**
 * Checks whether ANSI color output should be enabled for a stream based on its
 * TTY status (or explicit `isTTY` override), `NO_COLOR`, and `TERM`.
 *
 * Used by themes, terminal sessions, error formatters, and `Acclimate.log` so
 * piped streams, `NO_COLOR`, and `TERM=dumb` stay plain text.
 */
export function isColorEnabledForStream(options: {
  stream?: Readonly<TerminalOutputStream>;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
}): boolean {
  const env = options.env ?? process.env;
  const isNoColorSet = env.NO_COLOR !== undefined && env.NO_COLOR !== "";
  const isDumbTerm = env.TERM === "dumb";
  const isTty = options.isTTY ?? options.stream?.isTTY === true;
  return isTty && !isNoColorSet && !isDumbTerm;
}
