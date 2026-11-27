import { isColorEnabledForStream } from "@/terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import {
  ANSI_RESET_CODE,
  ANSI_STYLE_CODES,
  DEFAULT_DARK_THEME_PALETTE,
} from "../theme.constants";
import type {
  AnsiStyleToken,
  CreateThemeOptions,
  SemanticRoleStyleInput,
  SemanticTheme,
  SemanticThemePalette,
  SemanticThemePaletteOverrides,
  SemanticThemeRole,
} from "../theme.types";

function _isAnsiStyleToken(value: string): value is AnsiStyleToken {
  return Object.prototype.hasOwnProperty.call(ANSI_STYLE_CODES, value);
}

function _styleInputToAnsiSequence(input: SemanticRoleStyleInput): string {
  if (typeof input === "string") {
    return _isAnsiStyleToken(input) ? ANSI_STYLE_CODES[input] : input;
  }
  return input
    .map((token) => {
      return ANSI_STYLE_CODES[token];
    })
    .join("");
}

function _getRoleAnsiSequence(options: {
  role: SemanticThemeRole;
  overrides?: Readonly<SemanticThemePaletteOverrides>;
}): string {
  const override = options.overrides?.[options.role];
  return override !== undefined
    ? _styleInputToAnsiSequence(override)
    : DEFAULT_DARK_THEME_PALETTE[options.role];
}

function _buildPaletteFromOverrides(
  overrides?: Readonly<SemanticThemePaletteOverrides>,
): SemanticThemePalette {
  return {
    heading: _getRoleAnsiSequence({ role: "heading", overrides }),
    accent: _getRoleAnsiSequence({ role: "accent", overrides }),
    value: _getRoleAnsiSequence({ role: "value", overrides }),
    muted: _getRoleAnsiSequence({ role: "muted", overrides }),
    success: _getRoleAnsiSequence({ role: "success", overrides }),
    warning: _getRoleAnsiSequence({ role: "warning", overrides }),
    error: _getRoleAnsiSequence({ role: "error", overrides }),
    info: _getRoleAnsiSequence({ role: "info", overrides }),
    prompt: _getRoleAnsiSequence({ role: "prompt", overrides }),
    selected: _getRoleAnsiSequence({ role: "selected", overrides }),
  };
}

function _buildThemeObject(options: {
  palette: Readonly<SemanticThemePalette>;
  isColorEnabled: boolean;
}): SemanticTheme {
  const palette: SemanticThemePalette = { ...options.palette };
  const style = (role: SemanticThemeRole, text: string): string => {
    return !options.isColorEnabled || text === ""
      ? text
      : `${palette[role]}${text}${ANSI_RESET_CODE}`;
  };
  const roleFormatter = (role: SemanticThemeRole) => {
    return (text: string): string => {
      return style(role, text);
    };
  };

  return {
    isColorEnabled: options.isColorEnabled,
    palette,
    style,
    withColor: (nextColorEnabled: boolean): SemanticTheme => {
      return _buildThemeObject({ palette, isColorEnabled: nextColorEnabled });
    },
    heading: roleFormatter("heading"),
    accent: roleFormatter("accent"),
    value: roleFormatter("value"),
    muted: roleFormatter("muted"),
    success: roleFormatter("success"),
    warning: roleFormatter("warning"),
    error: roleFormatter("error"),
    info: roleFormatter("info"),
    prompt: roleFormatter("prompt"),
    selected: roleFormatter("selected"),
  };
}

/**
 * Creates a dark-terminal semantic theme whose role methods emit ANSI SGR
 * sequences only when color is enabled for the target stream and environment
 * (`isTTY`, `NO_COLOR`, and `TERM`).
 *
 * Use to style CLI headings, prompts, menus, help text, and status messages
 * consistently while keeping piped and `NO_COLOR`/`TERM=dumb` output plain.
 */
export function createTheme(
  options: Readonly<CreateThemeOptions> = {},
): SemanticTheme {
  const isColorEnabled =
    options.color ??
    isColorEnabledForStream({
      stream:
        options.stream ??
        (options.isTTY === undefined ? process.stderr : undefined),
      isTTY: options.isTTY,
      env: options.env,
    });
  const palette = _buildPaletteFromOverrides(options.palette);

  return _buildThemeObject({ palette, isColorEnabled });
}
