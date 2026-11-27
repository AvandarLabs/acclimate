import { CliError } from "@/CliError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { requestChoiceMenu } from "@/requestChoiceMenu/requestChoiceMenu";
import { createLineReader } from "@/terminalSession/createLineReader/createLineReader";
import { makeTerminalSessionFromPromptIo } from "@/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo";
import { openTerminalSession } from "@/terminalSession/openTerminalSession/openTerminalSession";
import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import type { CliParamScalarValue } from "@/AcclimateCli/AcclimateCli.types";
import type { ChoiceMenuItem } from "@/requestChoiceMenu/requestChoiceMenu.types";
import type { TerminalLineReader } from "@/terminalSession/createLineReader/createLineReader";
import type {
  PromptIo,
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { SemanticTheme, ThemeInput } from "@/theme/theme.types";

const SKIP_CHOICE_VALUE = "__acclimate_skip_choice__";

/** Validation and formatting configuration for `requestTerminalInput`. */
export type RequestTerminalInputResponseOptions = {
  required: boolean;
  type?: "string" | "number" | "boolean";

  /**
   * Default value returned when the user submits an empty response (or when
   * optional and running unattended).
   */
  defaultValue?: CliParamScalarValue;

  /** Allowed discrete values; when present, renders an interactive choice menu. */
  choices?: readonly CliParamScalarValue[];

  /** Optional validator returning `true` or an inline error string to retry. */
  validate?: (rawValue: string) => boolean | string;
};

/** Options accepted by `requestTerminalInput` and `Acclimate.requestInput`. */
export type RequestTerminalInputOptions = {
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  terminal?: TerminalSession;
  promptIo?: PromptIo;
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  openTty?: () => Promise<TerminalSession | undefined>;
  interactive?: boolean;
  cliName?: string;
  theme?: ThemeInput;
};

function _scalarToString(value: CliParamScalarValue): string {
  return typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : value
        ? "true"
        : "false";
}

function _buildLinePromptText(options: {
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  theme: SemanticTheme;
}): string {
  const { required, type, defaultValue } = options.responseOptions;
  const notice =
    defaultValue !== undefined
      ? ` ${options.theme.muted("(press Enter to use default)")}`
      : required
        ? ""
        : ` ${options.theme.muted("(press Enter to leave empty)")}`;
  const defaultNotice =
    defaultValue !== undefined ? ` [default: ${defaultValue}]` : "";
  const booleanNotice = type === "boolean" ? " (y/n)" : "";
  const formattedMessage = generateTerminalMessage(
    options.message,
    options.params,
    { theme: options.theme },
  );
  return `${formattedMessage}${defaultNotice}${booleanNotice}${notice} `;
}

function _validateCustomRule(options: {
  rawValue: string;
  validate: ((rawValue: string) => boolean | string) | undefined;
  theme: Readonly<SemanticTheme>;
}): string | undefined {
  if (!options.validate) {
    return undefined;
  }
  const validationResult = options.validate(options.rawValue);
  if (validationResult === true) {
    return undefined;
  }
  const message =
    typeof validationResult === "string"
      ? validationResult
      : "That value is not valid.";
  return `${options.theme.error(message)} Please try again.\n`;
}

async function _promptViaChoiceMenu(options: {
  session: Readonly<TerminalSession>;
  heading: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  cliName: string;
  theme: SemanticTheme;
}): Promise<string | undefined> {
  const { session, heading, responseOptions, cliName, theme } = options;
  const { required, defaultValue, choices } = responseOptions;
  const baseChoices: ChoiceMenuItem[] = (choices ?? []).map((choice) => {
    const stringValue = _scalarToString(choice);
    return { value: stringValue, label: stringValue };
  });
  const canSkip = !required && defaultValue === undefined;
  const menuChoices: ChoiceMenuItem[] = canSkip
    ? [
        ...baseChoices,
        {
          value: SKIP_CHOICE_VALUE,
          label: "(skip)",
          description: "Leave empty",
        },
      ]
    : baseChoices;

  const selected = await requestChoiceMenu({
    message: heading,
    choices: menuChoices,
    defaultValue:
      defaultValue !== undefined ? _scalarToString(defaultValue) : undefined,
    terminal: session,
    cliName,
    theme,
  });

  return selected === SKIP_CHOICE_VALUE ? undefined : selected;
}

async function _promptBooleanMenu(options: {
  session: Readonly<TerminalSession>;
  heading: string;
  defaultValue: CliParamScalarValue | undefined;
  cliName: string;
  theme: SemanticTheme;
}): Promise<string> {
  const defaultSelection =
    typeof options.defaultValue === "boolean"
      ? options.defaultValue
        ? "true"
        : "false"
      : undefined;

  return requestChoiceMenu({
    message: options.heading,
    choices: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
    defaultValue: defaultSelection,
    terminal: options.session,
    cliName: options.cliName,
    theme: options.theme,
  });
}

type LineAnswerEvaluation =
  | { status: "accepted"; value: string | undefined }
  | { status: "retry"; errorMessage: string };

function _evaluateEmptyAnswer(options: {
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  theme: Readonly<SemanticTheme>;
}): LineAnswerEvaluation {
  const { responseOptions, theme } = options;
  if (responseOptions.defaultValue !== undefined) {
    return {
      status: "accepted",
      value: _scalarToString(responseOptions.defaultValue),
    };
  }
  return responseOptions.required
    ? {
        status: "retry",
        errorMessage: `${theme.error("This value is required.")} Please enter a value.\n`,
      }
    : { status: "accepted", value: undefined };
}

function _evaluateLineAnswer(options: {
  answer: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  theme: Readonly<SemanticTheme>;
}): LineAnswerEvaluation {
  const { answer, responseOptions, theme } = options;
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return _evaluateEmptyAnswer({ responseOptions, theme });
  }

  if (responseOptions.type === "boolean") {
    const normalized = trimmed.toLowerCase();
    if (normalized === "y" || normalized === "yes") {
      return { status: "accepted", value: "true" };
    }
    if (normalized === "n" || normalized === "no") {
      return { status: "accepted", value: "false" };
    }
    return {
      status: "retry",
      errorMessage: `${theme.error("That was not a valid response.")} Please enter y or n.\n`,
    };
  }

  if (responseOptions.type === "number" && Number.isNaN(Number(trimmed))) {
    return {
      status: "retry",
      errorMessage: `${theme.error("That was not a valid number.")} Please enter a valid number.\n`,
    };
  }

  const customError = _validateCustomRule({
    rawValue: answer,
    validate: responseOptions.validate,
    theme,
  });
  return customError !== undefined
    ? { status: "retry", errorMessage: customError }
    : { status: "accepted", value: answer };
}

async function _promptLineUntilValid(options: {
  lineReader: Readonly<TerminalLineReader>;
  session: Readonly<TerminalSession>;
  promptText: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  theme: Readonly<SemanticTheme>;
}): Promise<string | undefined> {
  const answer = await options.lineReader.readLine(options.promptText);
  const evaluation = _evaluateLineAnswer({
    answer,
    responseOptions: options.responseOptions,
    theme: options.theme,
  });
  if (evaluation.status === "accepted") {
    return evaluation.value;
  }
  options.session.output.write(evaluation.errorMessage);
  return _promptLineUntilValid(options);
}

async function _openInputTerminalSession(
  options: Readonly<RequestTerminalInputOptions>,
): Promise<TerminalSession | undefined> {
  const injectedSession =
    options.terminal ??
    (options.promptIo
      ? makeTerminalSessionFromPromptIo({
          promptIo: options.promptIo,
          env: options.env,
        })
      : undefined);
  return openTerminalSession({
    session: injectedSession,
    interactive: options.interactive,
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr,
    env: options.env,
    openTty: options.openTty,
  });
}

type PromptWithSessionOptions = {
  session: Readonly<TerminalSession>;
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  cliName: string;
  theme: SemanticTheme;
};

async function _promptWithSession(
  options: Readonly<PromptWithSessionOptions>,
): Promise<string | undefined> {
  const { session, message, params, responseOptions, cliName, theme } = options;
  const heading = generateTerminalMessage(message, params, { color: false });
  if (responseOptions.choices && responseOptions.choices.length > 0) {
    return _promptViaChoiceMenu({
      session,
      heading,
      responseOptions,
      cliName,
      theme,
    });
  }
  if (responseOptions.type === "boolean" && session.isRawModeSupported) {
    return _promptBooleanMenu({
      session,
      heading,
      defaultValue: responseOptions.defaultValue,
      cliName,
      theme,
    });
  }

  const lineReader = createLineReader({ session, cliName });
  const promptText = _buildLinePromptText({
    message,
    params,
    responseOptions,
    theme,
  });
  try {
    return await _promptLineUntilValid({
      lineReader,
      session,
      promptText,
      responseOptions,
      theme,
    });
  } finally {
    lineReader.close();
  }
}

/**
 * Prompts the user for interactive input over the controlling terminal
 * (`/dev/tty`, an injected `TerminalSession`, or `PromptIo`), delegating
 * `choices` and raw-TTY `boolean` prompts to `requestChoiceMenu` and failing
 * fast in unattended mode instead of hanging on piped `stdin`.
 *
 * Used by `Acclimate.requestInput` and `promptCliParam`.
 */
export async function requestTerminalInput(
  options: Readonly<RequestTerminalInputOptions>,
): Promise<string | undefined> {
  const { message, params, responseOptions } = options;
  const cliName = options.cliName ?? "acclimate";
  const session = await _openInputTerminalSession(options);

  if (!session) {
    if (!responseOptions.required) {
      return responseOptions.defaultValue !== undefined
        ? _scalarToString(responseOptions.defaultValue)
        : undefined;
    }
    const plainMessage = generateTerminalMessage(message, params, {
      color: false,
    });
    throw CliError.interactiveInputUnavailable({
      cliName,
      message: `Required prompt "${plainMessage}" cannot run without an interactive terminal.`,
    });
  }

  const theme = makeThemeFromOptions({
    theme: options.theme,
    color: session.isColorEnabled,
  });
  try {
    return await _promptWithSession({
      session,
      message,
      params,
      responseOptions,
      cliName,
      theme,
    });
  } finally {
    await session.close();
  }
}
