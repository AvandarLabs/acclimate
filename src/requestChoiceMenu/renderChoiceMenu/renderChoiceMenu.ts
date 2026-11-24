import { generateTerminalMessage } from "@/generateTerminalMessage";
import type { ChoiceMenuItem } from "../requestChoiceMenu.types";

type RenderChoiceMenuOptions = {
  message: string;
  choices: readonly ChoiceMenuItem[];
  selectedIndex: number;
  defaultValue?: string;
  hint?: string;
  isColorEnabled: boolean;
};

function _formatChoiceLine(options: {
  item: Readonly<ChoiceMenuItem>;
  isSelected: boolean;
  isDefault: boolean;
  isColorEnabled: boolean;
}): string {
  const { item, isSelected, isDefault, isColorEnabled } = options;
  const label = item.label ?? item.value;
  const defaultBadge = isDefault ? " |gray|(default)|reset|" : "";
  const description =
    item.description !== undefined ? ` - |gray|${item.description}|reset|` : "";
  const prefix =
    isSelected ? `|bold||bright_green|❯ ${label}|reset|` : `  ${label}`;

  return generateTerminalMessage(
    `${prefix}${defaultBadge}${description}`,
    {},
    { color: isColorEnabled },
  );
}

/**
 * Renders an interactive choice menu header and item list with a bold-green
 * highlighted selection and textual `❯` cursor (or plain text when color is
 * disabled).
 *
 * Called by `requestChoiceMenu` on initial draw and each navigation update.
 */
export function renderChoiceMenu(options: Readonly<RenderChoiceMenuOptions>): {
  text: string;
  lineCount: number;
} {
  const hint =
    options.hint ?? "(↑/↓ or j/k to move, g/G first/last, Enter to select)";
  const headerLine = generateTerminalMessage(
    `|bright_cyan|? ${options.message}|reset| |gray|${hint}|reset|`,
    {},
    { color: options.isColorEnabled },
  );

  const choiceLines = options.choices.map((item, idx) => {
    return _formatChoiceLine({
      item,
      isSelected: idx === options.selectedIndex,
      isDefault:
        options.defaultValue !== undefined &&
        item.value === options.defaultValue,
      isColorEnabled: options.isColorEnabled,
    });
  });

  const allLines = [headerLine, ...choiceLines];
  return {
    text: `${allLines.join("\n")}\n`,
    lineCount: allLines.length,
  };
}
