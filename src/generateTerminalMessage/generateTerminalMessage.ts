import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import {
  ANSI_STYLE_CODES,
  SEMANTIC_THEME_ROLES,
} from "@/theme/theme.constants";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";
import type {
  AnsiStyleToken,
  SemanticThemePalette,
  SemanticThemeRole,
  ThemeInput,
} from "@/theme/theme.types";

const PARAM_TOKEN_REGEX = /\$([a-zA-Z0-9_]+)\$/g;
const COLOR_TOKEN_REGEX = /\|([a-zA-Z_]+)\|/g;

type GenerateTerminalMessageOptions = {
  color?: boolean;
  theme?: ThemeInput;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};

function _isSemanticRole(tokenName: string): tokenName is SemanticThemeRole {
  return SEMANTIC_THEME_ROLES.some((role) => {
    return role === tokenName;
  });
}

function _isAnsiStyleToken(tokenName: string): tokenName is AnsiStyleToken {
  return Object.prototype.hasOwnProperty.call(ANSI_STYLE_CODES, tokenName);
}

function _interpolateParams(
  message: string,
  params: Readonly<
    Record<string, string | boolean | number | null | undefined>
  >,
): string {
  return message.replace(PARAM_TOKEN_REGEX, (_match: string, key: string) => {
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}

function _lookupTokenCode(options: {
  tokenName: string;
  palette: Readonly<SemanticThemePalette>;
}): string | undefined {
  const normalized = options.tokenName.toLowerCase();
  if (_isSemanticRole(normalized)) {
    return options.palette[normalized];
  }
  if (_isAnsiStyleToken(normalized)) {
    return ANSI_STYLE_CODES[normalized];
  }
  return undefined;
}

/**
 * Formats a terminal message with `$varName$` interpolation plus raw
 * `|<COLOR>|` and semantic `|<ROLE>|` styling tokens, or strips known tokens
 * when color is disabled by `color: false`, a non-TTY stream, `NO_COLOR`, or
 * `TERM=dumb`.
 *
 * Used by `Acclimate.log`, interactive prompts, and custom consumer templates
 * to keep dark-terminal styling and plain-mode output consistent.
 */
export function generateTerminalMessage(
  message: string,
  params: Readonly<
    Record<string, string | boolean | number | null | undefined>
  > = {},
  options: Readonly<GenerateTerminalMessageOptions> = {},
): string {
  const theme = makeThemeFromOptions({
    theme: options.theme,
    color: options.color,
    stream: options.stream,
    isTTY: options.isTTY,
    env: options.env,
    defaultColor: true,
  });

  if (!theme.isColorEnabled) {
    return _interpolateParams(message, params).replace(
      COLOR_TOKEN_REGEX,
      (match, tokenName: string) => {
        return _lookupTokenCode({ tokenName, palette: theme.palette }) !==
          undefined
          ? ""
          : match;
      },
    );
  }

  const hasColorToken = Boolean(message.match(COLOR_TOKEN_REGEX));
  const endsWithReset = message.trimEnd().endsWith("|reset|");
  const withReset =
    hasColorToken && !endsWithReset ? `${message}|reset|` : message;
  const interpolated = _interpolateParams(withReset, params);
  return interpolated.replace(COLOR_TOKEN_REGEX, (match, tokenName: string) => {
    return _lookupTokenCode({ tokenName, palette: theme.palette }) ?? match;
  });
}
