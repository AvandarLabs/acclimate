/** Single navigation or control event parsed from raw terminal input. */
export type MenuKeyEvent =
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "digit"; index: number }
  | { kind: "confirm" }
  | { kind: "cancel"; reason: "ctrl_c" | "eof" };

/**
 * Result of parsing a raw key chunk with any trailing incomplete escape bytes.
 */
export type ParsedMenuKeyChunk = {
  events: MenuKeyEvent[];
  pendingEscapeBuffer: string;
};

const ESCAPE_SEQUENCES: Readonly<Record<string, MenuKeyEvent>> = {
  "\x1b[A": { kind: "up" },
  "\x1bOA": { kind: "up" },
  "\x1b[B": { kind: "down" },
  "\x1bOB": { kind: "down" },
  "\x1b[H": { kind: "first" },
  "\x1bOH": { kind: "first" },
  "\x1b[1~": { kind: "first" },
  "\x1b[F": { kind: "last" },
  "\x1bOF": { kind: "last" },
  "\x1b[4~": { kind: "last" },
};

const INCOMPLETE_ESCAPE_PREFIXES = new Set([
  "\x1b",
  "\x1b[",
  "\x1bO",
  "\x1b[1",
  "\x1b[4",
]);

function _parseSingleCharEvent(char: string): MenuKeyEvent | undefined {
  if (char === "k") {
    return { kind: "up" };
  }
  if (char === "j") {
    return { kind: "down" };
  }
  if (char === "g") {
    return { kind: "first" };
  }
  if (char === "G") {
    return { kind: "last" };
  }
  if (char === "\r" || char === "\n") {
    return { kind: "confirm" };
  }
  if (char === "\x03") {
    return { kind: "cancel", reason: "ctrl_c" };
  }
  if (char === "\x04") {
    return { kind: "cancel", reason: "eof" };
  }
  if (char >= "1" && char <= "9") {
    return { kind: "digit", index: Number.parseInt(char, 10) - 1 };
  }
  return undefined;
}

function _matchEscapeAt(
  combined: string,
  startIndex: number,
): { event?: MenuKeyEvent; consumed: number; isIncomplete: boolean } {
  const remaining = combined.slice(startIndex);
  if (INCOMPLETE_ESCAPE_PREFIXES.has(remaining)) {
    return { consumed: 0, isIncomplete: true };
  }

  const fourChar = remaining.slice(0, 4);
  if (ESCAPE_SEQUENCES[fourChar]) {
    return {
      event: ESCAPE_SEQUENCES[fourChar],
      consumed: 4,
      isIncomplete: false,
    };
  }

  const threeChar = remaining.slice(0, 3);
  if (ESCAPE_SEQUENCES[threeChar]) {
    return {
      event: ESCAPE_SEQUENCES[threeChar],
      consumed: 3,
      isIncomplete: false,
    };
  }

  // Skip unrecognized CSI/SS3 escape sequence or stray ESC byte.
  const hasPrefix =
    remaining.startsWith("\x1b[") || remaining.startsWith("\x1bO");
  return {
    consumed: hasPrefix && remaining.length >= 3 ? 3 : 1,
    isIncomplete: false,
  };
}

/**
 * Pure key-sequence parser and index transition logic for interactive choice
 * menus supporting arrow keys, Vim `j`/`k`/`g`/`G`, `Home`/`End`, digits
 * `1`-`9`, `Enter`, `Ctrl-C`, and `Ctrl-D`.
 *
 * Called by `requestChoiceMenu` to keep raw terminal parsing decoupled from IO.
 */
export const MenuNavigation = {
  /** Parse a raw chunk into menu events plus any trailing incomplete escape bytes. */
  parseKeyChunk: (
    chunk: string,
    pendingEscapeBuffer: string = "",
  ): ParsedMenuKeyChunk => {
    const combined = `${pendingEscapeBuffer}${chunk}`;
    const events: MenuKeyEvent[] = [];
    let cursor = 0;

    while (cursor < combined.length) {
      const char = combined[cursor]!;
      if (char === "\x1b") {
        const escapeMatch = _matchEscapeAt(combined, cursor);
        if (escapeMatch.isIncomplete) {
          return { events, pendingEscapeBuffer: combined.slice(cursor) };
        }
        if (escapeMatch.event) {
          events.push(escapeMatch.event);
        }
        cursor += escapeMatch.consumed;
        continue;
      }

      const event = _parseSingleCharEvent(char);
      if (event) {
        events.push(event);
      }
      // Treat CRLF pairs as one Enter keypress.
      if (char === "\r" && combined[cursor + 1] === "\n") {
        cursor += 2;
      } else {
        cursor += 1;
      }
    }

    return { events, pendingEscapeBuffer: "" };
  },

  /** Compute the next highlighted choice index with wrapping and bounds checks. */
  stepIndex: (options: {
    selectedIndex: number;
    numChoices: number;
    event: Readonly<MenuKeyEvent>;
  }): number => {
    const { selectedIndex, numChoices, event } = options;
    if (numChoices <= 1) {
      return 0;
    }
    if (event.kind === "up") {
      return (selectedIndex - 1 + numChoices) % numChoices;
    }
    if (event.kind === "down") {
      return (selectedIndex + 1) % numChoices;
    }
    if (event.kind === "first") {
      return 0;
    }
    if (event.kind === "last") {
      return numChoices - 1;
    }
    if (event.kind === "digit") {
      return event.index >= 0 && event.index < numChoices
        ? event.index
        : selectedIndex;
    }
    return selectedIndex;
  },
};
