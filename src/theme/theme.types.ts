import type { ANSI_STYLE_CODES, SEMANTIC_THEME_ROLES } from "./theme.constants";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";

/** Named ANSI style token accepted when configuring semantic theme roles. */
export type AnsiStyleToken = keyof typeof ANSI_STYLE_CODES;

/** Semantic styling role identifying the meaning of a terminal text segment. */
export type SemanticThemeRole = (typeof SEMANTIC_THEME_ROLES)[number];

/** Style input accepted for a semantic role override. */
export type SemanticRoleStyleInput =
  | AnsiStyleToken
  | readonly AnsiStyleToken[]
  | `\x1b[${string}`;

/** Complete mapping from each semantic role to its ANSI prefix sequence. */
export type SemanticThemePalette = Record<SemanticThemeRole, string>;

/** Partial role overrides merged onto the default dark-terminal palette. */
export type SemanticThemePaletteOverrides = Partial<
  Record<SemanticThemeRole, SemanticRoleStyleInput>
>;

/** Options for creating a TTY- and environment-aware semantic theme. */
export type CreateThemeOptions = {
  /** Explicit color override bypassing stream and environment checks. */
  color?: boolean;

  /** Target output stream whose `isTTY` flag is inspected for color support. */
  stream?: TerminalOutputStream;

  /** Explicit TTY override taking precedence over `stream.isTTY`. */
  isTTY?: boolean;

  /** Environment variables checked for `NO_COLOR` and `TERM`. */
  env?: Readonly<Record<string, string | undefined>>;

  /** Partial semantic role overrides merged onto the dark-terminal palette. */
  palette?: Readonly<SemanticThemePaletteOverrides>;
};

/**
 * Semantic theme formatter exposing role-based styling methods that emit ANSI
 * escapes only when color is enabled for the target stream and environment.
 */
export type SemanticTheme = {
  /** Whether ANSI escape sequences are emitted by this theme. */
  isColorEnabled: boolean;

  /** Active ANSI prefix sequence for every semantic role. */
  palette: SemanticThemePalette;

  /** Style `text` using the named semantic role, or return plain text. */
  style: (role: SemanticThemeRole, text: string) => string;

  /** Return a theme sharing this palette with a new color toggle. */
  withColor: (isColorEnabled: boolean) => SemanticTheme;

  /** Style section headings (for example `Usage` and `Options`). */
  heading: (text: string) => string;

  /** Style primary accents such as CLI and command names. */
  accent: (text: string) => string;

  /** Style parameter names, command labels, and concrete values. */
  value: (text: string) => string;

  /** Style secondary descriptions, hints, and badges. */
  muted: (text: string) => string;

  /** Style success confirmations and status banners. */
  success: (text: string) => string;

  /** Style warnings, recovery guidance, and cancellations. */
  warning: (text: string) => string;

  /** Style error messages, required markers, and inline failures. */
  error: (text: string) => string;

  /** Style informational progress and diagnostic status notices. */
  info: (text: string) => string;

  /** Style interactive prompt questions. */
  prompt: (text: string) => string;

  /** Style the currently highlighted choice menu selection. */
  selected: (text: string) => string;
};

/**
 * Accepts either a constructed `SemanticTheme` or partial palette overrides.
 */
export type ThemeInput =
  | SemanticTheme
  | Readonly<SemanticThemePaletteOverrides>;
