export { Acclimate } from "./Acclimate";
export { executeCLI } from "./AcclimateCLI/executeCLI/executeCLI";
export { generateHelpText } from "./AcclimateCLI/generateHelpText/generateHelpText";
export { CLIError } from "./CLIError";
export { requestChoiceMenu } from "./requestChoiceMenu/requestChoiceMenu";
export { requestTerminalInput } from "./requestTerminalInput/requestTerminalInput";
export { isColorEnabledForStream } from "./terminalSession/isColorEnabledForStream/isColorEnabledForStream";
export { openTerminalSession } from "./terminalSession/openTerminalSession/openTerminalSession";
export type { CLIErrorCode } from "./CLIError";
export type {
  AnyCLI,
  CLICommandName,
  CLIExample,
  CLIFullOptionName,
  CLIOptionAlias,
  CLIOptionParam,
  CLIParamDataType,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIScalarPositionalParam,
  CLIVariadicPositionalParam,
  IAcclimateCLI,
  OutputStream,
} from "./AcclimateCLI/AcclimateCLI.types";
export type {
  ChoiceMenuItem,
  ChoiceMenuOptions,
} from "./requestChoiceMenu/requestChoiceMenu.types";
export type {
  RequestTerminalInputOptions,
  RequestTerminalInputResponseOptions,
} from "./requestTerminalInput/requestTerminalInput";
export type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
  TerminalSessionOptions,
} from "./terminalSession/terminalSession.types";
