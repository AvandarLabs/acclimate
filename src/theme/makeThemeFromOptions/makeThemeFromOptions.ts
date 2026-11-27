import { isColorEnabledForStream } from "@/terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import { createTheme } from "../createTheme/createTheme";
import type {
  SemanticTheme,
  SemanticThemePaletteOverrides,
  ThemeInput,
} from "../theme.types";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";

type MakeThemeFromOptionsInput = {
  theme?: ThemeInput;
  fallbackPalette?: Readonly<SemanticThemePaletteOverrides>;
  color?: boolean;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  defaultColor?: boolean;
};

function _isSemanticTheme(value: ThemeInput): value is SemanticTheme {
  return (
    "isColorEnabled" in value &&
    typeof value.style === "function" &&
    typeof value.withColor === "function"
  );
}

/**
 * Builds a `SemanticTheme` from optional caller overrides (`theme`, `color`,
 * `stream`, `isTTY`, `env`), preserving custom palettes while binding color
 * output to explicit toggles or stream/environment detection.
 *
 * Called by `generateHelpText`, `formatCliError`, `generateTerminalMessage`,
 * `runCli`, `executeCli`, and `Acclimate` output helpers.
 */
export function makeThemeFromOptions(
  options: Readonly<MakeThemeFromOptionsInput> = {},
): SemanticTheme {
  const hasStreamTarget =
    options.stream !== undefined ||
    options.isTTY !== undefined ||
    options.env !== undefined;
  const computedStreamColor = hasStreamTarget
    ? isColorEnabledForStream({
        stream: options.stream,
        isTTY: options.isTTY,
        env: options.env,
      })
    : undefined;

  if (options.theme !== undefined && _isSemanticTheme(options.theme)) {
    const effectiveColor =
      options.color ?? computedStreamColor ?? options.theme.isColorEnabled;
    return effectiveColor === options.theme.isColorEnabled
      ? options.theme
      : options.theme.withColor(effectiveColor);
  }

  const effectiveColor =
    options.color ?? computedStreamColor ?? options.defaultColor;
  const mergedPalette =
    options.fallbackPalette || options.theme
      ? { ...options.fallbackPalette, ...options.theme }
      : undefined;

  return createTheme({
    color: effectiveColor,
    palette: mergedPalette,
  });
}
