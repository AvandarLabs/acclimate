import { isColorEnabledForStream } from "../isColorEnabledForStream/isColorEnabledForStream";
import type { PromptIo, TerminalSession } from "../terminalSession.types";

/**
 * Converts a lightweight `PromptIo` pair into a `TerminalSession`, deriving
 * color and raw-mode capabilities from the output stream and environment when
 * not explicitly specified.
 *
 * Called by `runCli`, `executeCli`, `requestChoiceMenu`, and
 * `requestTerminalInput` when callers inject `promptIo`.
 */
export function makeTerminalSessionFromPromptIo(options: {
  promptIo: Readonly<PromptIo>;
  env?: Readonly<Record<string, string | undefined>>;
}): TerminalSession {
  const env = options.env ?? process.env;
  const { promptIo } = options;

  return {
    input: promptIo.input,
    output: promptIo.output,
    isColorEnabled:
      promptIo.isColorEnabled ??
      isColorEnabledForStream({ stream: promptIo.output, env }),
    isRawModeSupported:
      promptIo.isRawModeSupported ??
      (env.TERM !== "dumb" && typeof promptIo.input.setRawMode === "function"),
    close: async () => {
      await promptIo.close?.();
    },
  };
}
