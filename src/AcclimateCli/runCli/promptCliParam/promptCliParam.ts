import { CliError } from "@/CliError";
import { requestTerminalInput } from "@/requestTerminalInput";
import type { CliParamScalarValue } from "@/AcclimateCli/AcclimateCli.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";
import type { SemanticTheme } from "@/theme/theme.types";

/**
 * Parameter metadata needed to prompt or build an unattended missing-value
 * error.
 */
export type PromptableCliParam = {
  name: string;
  description?: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  askIfEmpty?: boolean | { message: string };
  defaultValue?: CliParamScalarValue;
  choices?: readonly CliParamScalarValue[];
};

type PromptCliParamOptions = {
  cliName: string;
  paramKind: "option" | "positional";
  param: Readonly<PromptableCliParam>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
  theme?: SemanticTheme;
};

function _makeUnattendedMissingParamError(options: {
  cliName: string;
  paramKind: "option" | "positional";
  paramName: string;
}): CliError {
  const { cliName, paramKind, paramName } = options;
  if (paramKind === "option") {
    return CliError.missingRequiredOption({
      cliName,
      optionName: paramName,
      message: `Required option "${paramName}" is missing (interactive prompting is unavailable in unattended mode). Pass ${paramName} <value> or run in an interactive terminal.`,
      hint: `Pass ${paramName} <value> (for example: ${cliName} ${paramName} <value>) or run ${cliName} --help.`,
    });
  }

  return CliError.missingRequiredPositionalArg({
    cliName,
    positionalArgName: paramName,
    message: `Required positional argument "${paramName}" is missing (interactive prompting is unavailable in unattended mode). Pass <${paramName}> or run in an interactive terminal.`,
    hint: `Pass <${paramName}> (for example: ${cliName} <${paramName}>) or run ${cliName} --help.`,
  });
}

/**
 * Prompts interactively for a missing `askIfEmpty` CLI parameter over the
 * active `TerminalSession`, or applies unattended fallback (throwing an
 * actionable flag/invocation error when required, or returning `undefined` when
 * optional).
 *
 * Called by `runCli` for scalar positionals, variadic positionals, and options.
 */
export async function promptCliParam(
  options: Readonly<PromptCliParamOptions>,
): Promise<string | undefined> {
  const { cliName, paramKind, param, getTerminalSession, theme } = options;
  const terminalSession = await getTerminalSession();

  if (!terminalSession) {
    if (param.required) {
      throw _makeUnattendedMissingParamError({
        cliName,
        paramKind,
        paramName: param.name,
      });
    }
    return undefined;
  }

  const description = param.description ? ` (${param.description})` : "";
  const baseMessage =
    typeof param.askIfEmpty === "object"
      ? param.askIfEmpty.message
      : `Please enter a value for ${param.name}${description}`;

  return requestTerminalInput({
    message: `|prompt|${baseMessage}|reset|`,
    params: {},
    responseOptions: {
      required: param.required,
      type: param.type,
      defaultValue: param.defaultValue,
      choices: param.choices,
    },
    terminal: terminalSession,
    cliName,
    theme,
  });
}
