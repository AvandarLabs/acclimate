import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import type { ChoiceMenuItem } from "../requestChoiceMenu.types";
import type { SemanticTheme, ThemeInput } from "@/theme/theme.types";

type RenderChoiceMenuOptions = {
  message: string;
  choices: readonly ChoiceMenuItem[];
  selectedIndex: number;
  defaultValue?: string;
  hint?: string;
  isColorEnabled: boolean;
  theme?: ThemeInput;
};

function _formatChoiceLine(options: {
  item: Readonly<ChoiceMenuItem>;
  isSelected: boolean;
  isDefault: boolean;
  theme: Readonly<SemanticTheme>;
}): string {
  const { item, isSelected, isDefault, theme } = options;
  const label = item.label ?? item.value;
  const defaultBadge = isDefault ? ` ${theme.muted("(default)")}` : "";
  const description =
    item.description !== undefined ? ` - ${theme.muted(item.description)}` : "";
  const prefix = isSelected ? theme.selected(`❯ ${label}`) : `  ${label}`;

  return `${prefix}${defaultBadge}${description}`;
}

/**
 * Renders an interactive choice menu header and item list using Acclimate's
 * semantic theme (`prompt`, `muted`, and bold-green `selected` with a textual
 * `❯` cursor, or plain text when color is disabled).
 *
 * Called by `requestChoiceMenu` on initial draw and each navigation update.
 */
export function renderChoiceMenu(options: Readonly<RenderChoiceMenuOptions>): {
  text: string;
  lineCount: number;
} {
  const theme = makeThemeFromOptions({
    theme: options.theme,
    color: options.isColorEnabled,
  });
  const hint =
    options.hint ?? "(↑/↓ or j/k to move, g/G first/last, Enter to select)";
  const headerLine = `${theme.prompt(`? ${options.message}`)} ${theme.muted(hint)}`;

  const choiceLines = options.choices.map((item, idx) => {
    return _formatChoiceLine({
      item,
      isSelected: idx === options.selectedIndex,
      isDefault:
        options.defaultValue !== undefined &&
        item.value === options.defaultValue,
      theme,
    });
  });

  const allLines = [headerLine, ...choiceLines];
  return {
    text: `${allLines.join("\n")}\n`,
    lineCount: allLines.length,
  };
}
