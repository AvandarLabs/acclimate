/** ANSI SGR reset sequence terminating styled terminal text. */
export const ANSI_RESET_CODE = "\x1b[0m";

/**
 * Named ANSI SGR escape sequences supported in terminal templates and themes.
 */
export const ANSI_STYLE_CODES = {
  reset: ANSI_RESET_CODE,
  bold: "\x1b[1m",
  dim: "\x1b[2m",
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
} as const;

/**
 * Ordered semantic styling roles supported across Acclimate output surfaces.
 */
export const SEMANTIC_THEME_ROLES = [
  "heading",
  "accent",
  "value",
  "muted",
  "success",
  "warning",
  "error",
  "info",
  "prompt",
  "selected",
] as const;

/**
 * High-contrast default semantic palette designed for dark terminals using the
 * bright half of the ANSI SGR palette (`90`-`97`, plus `bold` on `selected`).
 */
export const DEFAULT_DARK_THEME_PALETTE = {
  heading: ANSI_STYLE_CODES.bright_yellow,
  accent: ANSI_STYLE_CODES.bright_cyan,
  value: ANSI_STYLE_CODES.bright_white,
  muted: ANSI_STYLE_CODES.bright_black,
  success: ANSI_STYLE_CODES.bright_green,
  warning: ANSI_STYLE_CODES.bright_yellow,
  error: ANSI_STYLE_CODES.bright_red,
  info: ANSI_STYLE_CODES.bright_blue,
  prompt: ANSI_STYLE_CODES.bright_cyan,
  selected: `${ANSI_STYLE_CODES.bold}${ANSI_STYLE_CODES.bright_green}`,
} as const;
