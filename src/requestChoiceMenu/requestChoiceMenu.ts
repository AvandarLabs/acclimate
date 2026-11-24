import { CLIError } from "@/CLIError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { openTerminalSession } from "@/terminalSession/openTerminalSession/openTerminalSession";
import { MenuNavigation } from "./MenuNavigation/MenuNavigation";
import { renderChoiceMenu } from "./renderChoiceMenu/renderChoiceMenu";
import { runPlainChoiceMenu } from "./runPlainChoiceMenu";
import type { MenuKeyEvent } from "./MenuNavigation/MenuNavigation";
import type {
  ChoiceMenuItem,
  ChoiceMenuOptions,
} from "./requestChoiceMenu.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

const ANSI_HIDE_CURSOR = "\x1b[?25l";
const ANSI_SHOW_CURSOR = "\x1b[?25h";
const ANSI_CLEAR_BELOW = "\x1b[0J";

type RawMenuRuntimeOptions<TValue extends string> = {
  session: Readonly<TerminalSession>;
  message: string;
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue: TValue | undefined;
  hint: string | undefined;
  cliName: string;
};

type EventBatchOutcome =
  | { status: "continue"; nextIndex: number; didMove: boolean }
  | { status: "confirm"; selectedIndex: number }
  | { status: "cancel" };

type RawMenuState = {
  selectedIndex: number;
  pendingEscapeBuffer: string;
  renderedLineCount: number;
  isFinished: boolean;
};

type RawMenuListeners = {
  onData: (rawChunk: Buffer | string) => void;
  onEnd: () => void;
  onError: (error: unknown) => void;
};

function _findInitialIndex<TValue extends string>(options: {
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue: TValue | undefined;
}): number {
  if (options.defaultValue === undefined) {
    return 0;
  }
  const matchedIndex = options.choices.findIndex((item) => {
    return item.value === options.defaultValue;
  });
  return matchedIndex >= 0 ? matchedIndex : 0;
}

function _eraseRenderedLines(
  session: Readonly<TerminalSession>,
  lineCount: number,
): void {
  if (lineCount > 0) {
    session.output.write(`\x1b[${lineCount}A\r${ANSI_CLEAR_BELOW}`);
  }
}

function _applyMenuKeyEvents(options: {
  events: readonly MenuKeyEvent[];
  selectedIndex: number;
  numChoices: number;
}): EventBatchOutcome {
  return options.events.reduce<EventBatchOutcome>(
    (acc, event) => {
      if (acc.status !== "continue") {
        return acc;
      }
      if (event.kind === "cancel") {
        return { status: "cancel" };
      }
      if (event.kind === "confirm") {
        return { status: "confirm", selectedIndex: acc.nextIndex };
      }
      const nextSelectedIndex = MenuNavigation.stepIndex({
        selectedIndex: acc.nextIndex,
        numChoices: options.numChoices,
        event,
      });
      return {
        status: "continue",
        nextIndex: nextSelectedIndex,
        didMove: acc.didMove || nextSelectedIndex !== acc.nextIndex,
      };
    },
    { status: "continue", nextIndex: options.selectedIndex, didMove: false },
  );
}

function _restoreRawTerminalState(options: {
  session: Readonly<TerminalSession>;
  previousRawMode: boolean;
  listeners: Readonly<RawMenuListeners>;
}): void {
  const { session, previousRawMode, listeners } = options;
  session.input.off("data", listeners.onData);
  session.input.off("end", listeners.onEnd);
  session.input.off("close", listeners.onEnd);
  session.input.off("error", listeners.onError);
  if (typeof session.input.setRawMode === "function") {
    session.input.setRawMode(previousRawMode);
  }
  session.input.pause?.();
  session.output.write(ANSI_SHOW_CURSOR);
}

function _drawRawMenu<TValue extends string>(options: {
  runtime: Readonly<RawMenuRuntimeOptions<TValue>>;
  state: RawMenuState;
}): void {
  const { runtime, state } = options;
  _eraseRenderedLines(runtime.session, state.renderedLineCount);
  const rendered = renderChoiceMenu({
    message: runtime.message,
    choices: runtime.choices,
    selectedIndex: state.selectedIndex,
    defaultValue: runtime.defaultValue,
    hint: runtime.hint,
    isColorEnabled: runtime.session.isColorEnabled,
  });
  state.renderedLineCount = rendered.lineCount;
  runtime.session.output.write(rendered.text);
}

function _processRawMenuChunk<TValue extends string>(options: {
  rawChunk: Buffer | string;
  runtime: Readonly<RawMenuRuntimeOptions<TValue>>;
  state: RawMenuState;
  onCancel: () => void;
  onConfirm: (chosenItem: Readonly<ChoiceMenuItem<TValue>>) => void;
}): void {
  const { rawChunk, runtime, state, onCancel, onConfirm } = options;
  const parsed = MenuNavigation.parseKeyChunk(
    rawChunk.toString("utf8"),
    state.pendingEscapeBuffer,
  );
  state.pendingEscapeBuffer = parsed.pendingEscapeBuffer;
  const outcome = _applyMenuKeyEvents({
    events: parsed.events,
    selectedIndex: state.selectedIndex,
    numChoices: runtime.choices.length,
  });
  if (outcome.status === "cancel") {
    onCancel();
    return;
  }
  if (outcome.status === "confirm") {
    onConfirm(runtime.choices[outcome.selectedIndex]!);
    return;
  }
  state.selectedIndex = outcome.nextIndex;
  if (outcome.didMove && !state.isFinished) {
    _drawRawMenu({ runtime, state });
  }
}

function _writeMenuOutcomeLine(options: {
  session: Readonly<TerminalSession>;
  template: string;
}): void {
  options.session.output.write(
    generateTerminalMessage(
      options.template,
      {},
      { color: options.session.isColorEnabled },
    ),
  );
}

function _createRawMenuListeners<TValue extends string>(options: {
  runtime: Readonly<RawMenuRuntimeOptions<TValue>>;
  state: RawMenuState;
  previousRawMode: boolean;
  onResolve: (value: TValue) => void;
  onReject: (error: Error) => void;
}): RawMenuListeners {
  const { runtime, state, previousRawMode, onResolve, onReject } = options;
  const { session, message, cliName } = runtime;
  const finish = (onAfterCleanup: () => void) => {
    if (!state.isFinished) {
      state.isFinished = true;
      _restoreRawTerminalState({ session, previousRawMode, listeners });
      onAfterCleanup();
    }
  };
  const onCancel = () => {
    finish(() => {
      _writeMenuOutcomeLine({
        session,
        template: "|yellow|✖ Cancelled|reset|\n",
      });
      onReject(CLIError.promptCancelled({ cliName }));
    });
  };
  const onConfirm = (chosenItem: Readonly<ChoiceMenuItem<TValue>>) => {
    _eraseRenderedLines(session, state.renderedLineCount);
    finish(() => {
      const label = chosenItem.label ?? chosenItem.value;
      _writeMenuOutcomeLine({
        session,
        template: `|bright_green|✔|reset| |bright_cyan|${message}|reset|: ${label}\n`,
      });
      onResolve(chosenItem.value);
    });
  };
  const listeners: RawMenuListeners = {
    onData: (rawChunk) => {
      _processRawMenuChunk({ rawChunk, runtime, state, onCancel, onConfirm });
    },
    onEnd: onCancel,
    onError: (error) => {
      finish(() => {
        onReject(error instanceof Error ? error : new Error(String(error)));
      });
    },
  };
  return listeners;
}

function _runRawChoiceMenu<TValue extends string>(
  options: Readonly<RawMenuRuntimeOptions<TValue>>,
): Promise<TValue> {
  const { session, choices, defaultValue } = options;
  const previousRawMode = Boolean(session.input.isRaw);

  return new Promise<TValue>((resolvePromise, rejectPromise) => {
    const state: RawMenuState = {
      selectedIndex: _findInitialIndex({ choices, defaultValue }),
      pendingEscapeBuffer: "",
      renderedLineCount: 0,
      isFinished: false,
    };
    const listeners = _createRawMenuListeners({
      runtime: options,
      state,
      previousRawMode,
      onResolve: resolvePromise,
      onReject: rejectPromise,
    });

    session.output.write(ANSI_HIDE_CURSOR);
    session.input.setRawMode?.(true);
    session.input.resume?.();
    session.input.on("data", listeners.onData);
    session.input.on("end", listeners.onEnd);
    session.input.on("close", listeners.onEnd);
    session.input.on("error", listeners.onError);
    _drawRawMenu({ runtime: options, state });
  });
}

/**
 * Displays an interactive choice menu on the controlling terminal (`/dev/tty`
 * or an injected `TerminalSession`) with Up/Down and `j`/`k` wrapping, `g`/`G`
 * jump to first/last, bold-green highlighted selection, `Enter` confirmation,
 * and `Ctrl-C`/`EOF` cancellation that always restores terminal state.
 *
 * Used for `choices` options, boolean prompts, bare multi-command menus, and
 * `Acclimate.requestChoice`.
 */
export async function requestChoiceMenu<TValue extends string = string>(
  options: Readonly<ChoiceMenuOptions<TValue>>,
): Promise<TValue> {
  if (options.choices.length === 0) {
    throw new Error("Choice menu requires at least one choice.");
  }

  const cliName = options.cliName ?? "acclimate";
  const session = await openTerminalSession({
    session: options.terminal,
    interactive: options.interactive,
  });

  if (!session) {
    throw CLIError.interactiveInputUnavailable({
      cliName,
      message: `Interactive menu "${options.message}" requires a terminal.`,
    });
  }

  try {
    return session.isRawModeSupported ?
        await _runRawChoiceMenu({
          session,
          message: options.message,
          choices: options.choices,
          defaultValue: options.defaultValue,
          hint: options.hint,
          cliName,
        })
      : await runPlainChoiceMenu({
          session,
          message: options.message,
          choices: options.choices,
          defaultValue: options.defaultValue,
          cliName,
        });
  } finally {
    await session.close();
  }
}
