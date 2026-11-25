import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { CliError } from "@/CliError";
import type {
  TerminalOutputStream,
  TerminalSession,
} from "../terminalSession.types";

/**
 * Stateful line reader bound to a `TerminalSession` with Ctrl-C and EOF
 * cancellation support.
 */
export type TerminalLineReader = {
  /** Write `promptText` to the session output and read the next trimmed line. */
  readLine: (promptText: string) => Promise<string>;

  /** Close the underlying readline interface and remove signal listeners. */
  close: () => void;
};

function _toWritableStream(output: Readonly<TerminalOutputStream>): Writable {
  if (output instanceof Writable) {
    return output;
  }
  return new Writable({
    write: (chunk: Buffer | string, _encoding, onDone) => {
      output.write(chunk.toString("utf8"));
      onDone();
    },
  });
}

/**
 * Creates a queued line reader over a `TerminalSession` that preserves
 * multi-line buffered input, writes prompts exclusively to `session.output`,
 * and converts `SIGINT` or `EOF` into `CliError.promptCancelled`.
 *
 * Used by `requestTerminalInput` and plain-mode `requestChoiceMenu`.
 */
export function createLineReader(options: {
  session: Readonly<TerminalSession>;
  cliName: string;
}): TerminalLineReader {
  const { session, cliName } = options;
  const readlineInterface = createInterface({
    input: session.input,
    output: _toWritableStream(session.output),
    terminal: Boolean(session.input.isTTY && session.isRawModeSupported),
  });
  const lineIterator = readlineInterface[Symbol.asyncIterator]();

  const onSigint = () => {
    readlineInterface.close();
  };
  readlineInterface.on("SIGINT", onSigint);

  return {
    readLine: async (promptText: string): Promise<string> => {
      session.output.write(promptText);
      const nextLine = await lineIterator.next();
      if (nextLine.done) {
        throw CliError.promptCancelled({ cliName });
      }
      return nextLine.value;
    },
    close: () => {
      readlineInterface.off("SIGINT", onSigint);
      readlineInterface.close();
    },
  };
}
