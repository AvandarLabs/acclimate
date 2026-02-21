const COLOR_CODES: Record<string, string> = {
  reset: "\x1b[0m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bright_black: "\x1b[90m",
  gray: "\x1b[90m",
  grey: "\x1b[90m",
  bright_red: "\x1b[91m",
  bright_green: "\x1b[92m",
  bright_yellow: "\x1b[93m",
  bright_blue: "\x1b[94m",
  bright_magenta: "\x1b[95m",
  bright_cyan: "\x1b[96m",
  bright_white: "\x1b[97m",
};

const PARAM_TOKEN_REGEX = /\$([a-zA-Z0-9_]+)\$/g;
const COLOR_TOKEN_REGEX = /\|([a-zA-Z_]+)\|/g;

/**
 * Replaces `$token$` placeholders with values from `params`.
 * If a token does not exist in `params`, the placeholder is left unchanged.
 */
function interpolateParams(
  message: string,
  params: Record<string, string | boolean | number | null | undefined>,
): string {
  return message.replace(PARAM_TOKEN_REGEX, (match: string, key: string) => {
    void match;
    const value = params[key];
    if (value === undefined) {
      return "";
    }
    return String(value);
  });
}

function applyColors(message: string) {
  return message.replace(COLOR_TOKEN_REGEX, (match, colorName: string) => {
    const code = COLOR_CODES[colorName.toLowerCase()];
    return code ?? match;
  });
}

/**
 * Outputs a message intended to be passed directly to `console.log`
 *
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
export function generateTerminalMessage(
  message: string,
  params: Record<string, string | boolean | number | null | undefined> = {},
): string {
  const hasColorToken = Boolean(message.match(COLOR_TOKEN_REGEX));
  const endsWithReset = message.trimEnd().endsWith("|reset|");
  const withReset =
    hasColorToken && !endsWithReset ? `${message}|reset|` : message;
  const interpolated = interpolateParams(withReset, params);
  return applyColors(interpolated);
}
