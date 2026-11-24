import { CLIError } from "@/CLIError";
import { requestTerminalInput } from "@/requestTerminalInput";
import type { CLIParamScalarValue } from "@/AcclimateCLI/AcclimateCLI.types";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

/**
 * Parameter metadata needed to prompt or build an unattended missing-value
 * error.
 */
export type PromptableCLIParam = {
  name: string;
  description?: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  askIfEmpty?: boolean | { message: string };
  defaultValue?: CLIParamScalarValue;
  choices?: readonly CLIParamScalarValue[];
};

type PromptCLIParamOptions = {
  cliName: string;
  paramKind: "option" | "positional";
  param: Readonly<PromptableCLIParam>;
  getTerminalSession: () => Promise<TerminalSession | undefined>;
};

function _makeUnattendedMissingParamError(options: {
  cliName: string;
  paramKind: "option" | "positional";
  paramName: string;
}): CLIError {
  const { cliName, paramKind, paramName } = options;
  if (paramKind === "option") {
    return CLIError.missingRequiredOption({
      cliName,
      optionName: paramName,
      message: `Required option "${paramName}" is missing (interactive prompting is unavailable in unattended mode). Pass ${paramName} <value> or run in an interactive terminal.`,
      hint: `Pass ${paramName} <value> (for example: ${cliName} ${paramName} <value>) or run ${cliName} --help.`,
    });
  }

  return CLIError.missingRequiredPositionalArg({
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
 * Called by `runCLI` for scalar positionals, variadic positionals, and options.
 */
export async function promptCLIParam(
  options: Readonly<PromptCLIParamOptions>,
): Promise<string | undefined> {
  const { cliName, paramKind, param, getTerminalSession } = options;
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
    typeof param.askIfEmpty === "object" ?
      param.askIfEmpty.message
    : `Please enter a value for ${param.name}${description}`;

  return requestTerminalInput({
    message: `|bright_cyan|${baseMessage}|reset|`,
    params: {},
    responseOptions: {
      required: param.required,
      type: param.type,
      defaultValue: param.defaultValue,
      choices: param.choices,
    },
    terminal: terminalSession,
    cliName,
  });
}
