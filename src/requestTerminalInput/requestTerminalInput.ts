import { CLIError } from "@/CLIError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { requestChoiceMenu } from "@/requestChoiceMenu/requestChoiceMenu";
import { createLineReader } from "@/terminalSession/createLineReader/createLineReader";
import { openTerminalSession } from "@/terminalSession/openTerminalSession/openTerminalSession";
import type { CLIParamScalarValue } from "@/AcclimateCLI/AcclimateCLI.types";
import type { ChoiceMenuItem } from "@/requestChoiceMenu/requestChoiceMenu.types";
import type { TerminalLineReader } from "@/terminalSession/createLineReader/createLineReader";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

const SKIP_CHOICE_VALUE = "__acclimate_skip_choice__";

/** Validation and formatting configuration for `requestTerminalInput`. */
export type RequestTerminalInputResponseOptions = {
  required: boolean;
  type?: "string" | "number" | "boolean";

  /**
   * Default value returned when the user submits an empty response (or when
   * optional and running unattended).
   */
  defaultValue?: CLIParamScalarValue;

  /** Allowed discrete values; when present, renders an interactive choice menu. */
  choices?: readonly CLIParamScalarValue[];

  /** Optional validator returning `true` or an inline error string to retry. */
  validate?: (rawValue: string) => boolean | string;
};

/** Options accepted by `requestTerminalInput` and `Acclimate.requestInput`. */
export type RequestTerminalInputOptions = {
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  terminal?: TerminalSession;
  interactive?: boolean;
  cliName?: string;
};

function _scalarToString(value: CLIParamScalarValue): string {
  return (
    typeof value === "string" ? value
    : typeof value === "number" ? String(value)
    : value ? "true"
    : "false"
  );
}

function _buildLinePromptText(options: {
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  isColorEnabled: boolean;
}): string {
  const { required, type, defaultValue } = options.responseOptions;
  const notice =
    defaultValue !== undefined ? " |gray|(press Enter to use default)|reset|"
    : required ? ""
    : " |gray|(press Enter to leave empty)|reset|";
  const defaultNotice =
    defaultValue !== undefined ? ` [default: ${defaultValue}]` : "";
  const booleanNotice = type === "boolean" ? " |reset|(y/n)" : "";
  const promptTemplate = `${options.message}${defaultNotice}${booleanNotice}${notice} `;
  return generateTerminalMessage(promptTemplate, options.params, {
    color: options.isColorEnabled,
  });
}

function _writeInlineValidationError(
  session: Readonly<TerminalSession>,
  message: string,
): void {
  session.output.write(
    generateTerminalMessage(message, {}, { color: session.isColorEnabled }),
  );
}

function _validateCustomRule(options: {
  rawValue: string;
  validate: ((rawValue: string) => boolean | string) | undefined;
}): string | undefined {
  if (!options.validate) {
    return undefined;
  }
  const validationResult = options.validate(options.rawValue);
  if (validationResult === true) {
    return undefined;
  }
  return typeof validationResult === "string" ?
      `|red|${validationResult}|reset| Please try again.\n`
    : "|red|That value is not valid.|reset| Please try again.\n";
}

async function _promptViaChoiceMenu(options: {
  session: Readonly<TerminalSession>;
  heading: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  cliName: string;
}): Promise<string | undefined> {
  const { session, heading, responseOptions, cliName } = options;
  const { required, defaultValue, choices } = responseOptions;
  const baseChoices: ChoiceMenuItem[] = (choices ?? []).map((choice) => {
    const stringValue = _scalarToString(choice);
    return { value: stringValue, label: stringValue };
  });
  const canSkip = !required && defaultValue === undefined;
  const menuChoices: ChoiceMenuItem[] =
    canSkip ?
      [
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
  });

  return selected === SKIP_CHOICE_VALUE ? undefined : selected;
}

async function _promptBooleanMenu(options: {
  session: Readonly<TerminalSession>;
  heading: string;
  defaultValue: CLIParamScalarValue | undefined;
  cliName: string;
}): Promise<string> {
  const defaultSelection =
    typeof options.defaultValue === "boolean" ?
      options.defaultValue ?
        "true"
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
  });
}

type LineAnswerEvaluation =
  | { status: "accepted"; value: string | undefined }
  | { status: "retry"; errorMessage: string };

function _evaluateEmptyAnswer(
  responseOptions: Readonly<RequestTerminalInputResponseOptions>,
): LineAnswerEvaluation {
  if (responseOptions.defaultValue !== undefined) {
    return {
      status: "accepted",
      value: _scalarToString(responseOptions.defaultValue),
    };
  }
  return responseOptions.required ?
      {
        status: "retry",
        errorMessage:
          "|red|This value is required.|reset| Please enter a value.\n",
      }
    : { status: "accepted", value: undefined };
}

function _evaluateLineAnswer(options: {
  answer: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
}): LineAnswerEvaluation {
  const { answer, responseOptions } = options;
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return _evaluateEmptyAnswer(responseOptions);
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
      errorMessage:
        "|red|That was not a valid response.|reset| Please enter y or n.\n",
    };
  }

  if (responseOptions.type === "number" && Number.isNaN(Number(trimmed))) {
    return {
      status: "retry",
      errorMessage:
        "|red|That was not a valid number.|reset| Please enter a valid number.\n",
    };
  }

  const customError = _validateCustomRule({
    rawValue: answer,
    validate: responseOptions.validate,
  });
  return customError !== undefined ?
      { status: "retry", errorMessage: customError }
    : { status: "accepted", value: answer };
}

async function _promptLineUntilValid(options: {
  lineReader: Readonly<TerminalLineReader>;
  session: Readonly<TerminalSession>;
  promptText: string;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
}): Promise<string | undefined> {
  const answer = await options.lineReader.readLine(options.promptText);
  const evaluation = _evaluateLineAnswer({
    answer,
    responseOptions: options.responseOptions,
  });
  if (evaluation.status === "accepted") {
    return evaluation.value;
  }
  _writeInlineValidationError(options.session, evaluation.errorMessage);
  return _promptLineUntilValid(options);
}

async function _promptWithSession(options: {
  session: Readonly<TerminalSession>;
  message: string;
  params: Readonly<Record<string, string>>;
  responseOptions: Readonly<RequestTerminalInputResponseOptions>;
  cliName: string;
}): Promise<string | undefined> {
  const { session, message, params, responseOptions, cliName } = options;
  const plainHeading = generateTerminalMessage(message, params, {
    color: false,
  });
  if (responseOptions.choices && responseOptions.choices.length > 0) {
    return _promptViaChoiceMenu({
      session,
      heading: plainHeading,
      responseOptions,
      cliName,
    });
  }
  if (responseOptions.type === "boolean" && session.isRawModeSupported) {
    return _promptBooleanMenu({
      session,
      heading: plainHeading,
      defaultValue: responseOptions.defaultValue,
      cliName,
    });
  }

  const lineReader = createLineReader({ session, cliName });
  try {
    return await _promptLineUntilValid({
      lineReader,
      session,
      promptText: _buildLinePromptText({
        message,
        params,
        responseOptions,
        isColorEnabled: session.isColorEnabled,
      }),
      responseOptions,
    });
  } finally {
    lineReader.close();
  }
}

/**
 * Prompts the user for interactive input over the controlling terminal
 * (`/dev/tty`, or an injected `TerminalSession`), delegating `choices` and
 * raw-TTY `boolean` prompts to `requestChoiceMenu` and failing fast in
 * unattended mode instead of hanging on piped `stdin` or writing to `stdout`.
 *
 * Used by `Acclimate.requestInput` and `promptCLIParam`.
 */
export async function requestTerminalInput(
  options: Readonly<RequestTerminalInputOptions>,
): Promise<string | undefined> {
  const { message, params, responseOptions } = options;
  const cliName = options.cliName ?? "acclimate";
  const session = await openTerminalSession({
    session: options.terminal,
    interactive: options.interactive,
  });

  if (!session) {
    if (!responseOptions.required) {
      return responseOptions.defaultValue !== undefined ?
          _scalarToString(responseOptions.defaultValue)
        : undefined;
    }
    const plainMessage = generateTerminalMessage(message, params, {
      color: false,
    });
    throw CLIError.interactiveInputUnavailable({
      cliName,
      message: `Required prompt "${plainMessage}" cannot run without an interactive terminal.`,
    });
  }

  try {
    return await _promptWithSession({
      session,
      message,
      params,
      responseOptions,
      cliName,
    });
  } finally {
    await session.close();
  }
}
