import { createLineReader } from "@/terminalSession/createLineReader/createLineReader";
import type { ChoiceMenuItem } from "./requestChoiceMenu.types";
import type { TerminalLineReader } from "@/terminalSession/createLineReader/createLineReader";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _matchPlainChoice<TValue extends string>(options: {
  rawAnswer: string;
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue: TValue | undefined;
}): ChoiceMenuItem<TValue> | undefined {
  const trimmed = options.rawAnswer.trim();
  if (trimmed === "" && options.defaultValue !== undefined) {
    return options.choices.find((item) => {
      return item.value === options.defaultValue;
    });
  }

  if (/^\d+$/.test(trimmed)) {
    const parsedIndex = Number.parseInt(trimmed, 10) - 1;
    return options.choices[parsedIndex];
  }

  return options.choices.find((item) => {
    const label = item.label ?? item.value;
    return item.value === trimmed || label === trimmed;
  });
}

async function _promptPlainSelection<TValue extends string>(options: {
  lineReader: Readonly<TerminalLineReader>;
  session: Readonly<TerminalSession>;
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue: TValue | undefined;
}): Promise<ChoiceMenuItem<TValue>> {
  const { lineReader, session, choices, defaultValue } = options;
  const defaultPrompt =
    defaultValue !== undefined ? ` [default: ${defaultValue}]` : "";
  const promptText = `Enter choice (1-${choices.length})${defaultPrompt}: `;

  const answer = await lineReader.readLine(promptText);
  const matched = _matchPlainChoice({
    rawAnswer: answer,
    choices,
    defaultValue,
  });
  if (matched) {
    return matched;
  }

  session.output.write(
    `Invalid selection. Enter a number between 1 and ${choices.length}.\n`,
  );
  return _promptPlainSelection(options);
}

/**
 * Runs a plain numbered choice menu without raw-mode ANSI cursor controls,
 * validating numbered or exact-text responses until a valid item is chosen or
 * the user cancels.
 *
 * Called by `requestChoiceMenu` when `session.isRawModeSupported` is `false`.
 */
export async function runPlainChoiceMenu<TValue extends string>(options: {
  session: Readonly<TerminalSession>;
  message: string;
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue: TValue | undefined;
  cliName: string;
}): Promise<TValue> {
  const { session, message, choices, defaultValue, cliName } = options;
  const lines = [
    `? ${message}`,
    ...choices.map((item, idx) => {
      const label = item.label ?? item.value;
      const defaultBadge = item.value === defaultValue ? " (default)" : "";
      const description =
        item.description !== undefined ? ` - ${item.description}` : "";
      return `  ${idx + 1}. ${label}${defaultBadge}${description}`;
    }),
  ];
  session.output.write(`${lines.join("\n")}\n`);

  const lineReader = createLineReader({ session, cliName });
  try {
    const selected = await _promptPlainSelection({
      lineReader,
      session,
      choices,
      defaultValue,
    });
    return selected.value;
  } finally {
    lineReader.close();
  }
}
