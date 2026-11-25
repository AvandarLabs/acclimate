import { close, constants, open } from "node:fs";
import tty from "node:tty";
import { promisify } from "node:util";
import { isColorEnabledForStream } from "../isColorEnabledForStream/isColorEnabledForStream";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
  TerminalSessionOptions,
} from "../terminalSession.types";

const openFileDescriptor = promisify(open);
const closeFileDescriptor = promisify(close);

function _isRawModeAllowed(options: {
  input: Readonly<TerminalInputStream>;
  env: Readonly<Record<string, string | undefined>>;
}): boolean {
  return (
    options.env.TERM !== "dumb" &&
    typeof options.input.setRawMode === "function"
  );
}

async function _closeDescriptorQuietly(
  fileDescriptor: number | undefined,
): Promise<void> {
  if (fileDescriptor === undefined) {
    return;
  }
  try {
    await closeFileDescriptor(fileDescriptor);
  } catch {
    // Ignore close errors when cleaning up partially opened /dev/tty handles.
  }
}

async function _openPosixTtySession(
  env: Readonly<Record<string, string | undefined>>,
): Promise<TerminalSession | undefined> {
  if (process.platform === "win32") {
    return undefined;
  }

  let inputDescriptor: number | undefined;
  let outputDescriptor: number | undefined;

  try {
    inputDescriptor = await openFileDescriptor("/dev/tty", constants.O_RDONLY);
    outputDescriptor = await openFileDescriptor("/dev/tty", constants.O_WRONLY);
    const inputStream = new tty.ReadStream(inputDescriptor);
    inputDescriptor = undefined;
    const outputStream = new tty.WriteStream(outputDescriptor);
    outputDescriptor = undefined;

    return {
      input: inputStream,
      output: outputStream,
      isColorEnabled: isColorEnabledForStream({ stream: outputStream, env }),
      isRawModeSupported: _isRawModeAllowed({ input: inputStream, env }),
      close: () => {
        if (inputStream.isRaw) {
          inputStream.setRawMode(false);
        }
        inputStream.pause();
        inputStream.destroy();
        outputStream.destroy();
        return Promise.resolve();
      },
    };
  } catch {
    await _closeDescriptorQuietly(inputDescriptor);
    await _closeDescriptorQuietly(outputDescriptor);
    return undefined;
  }
}

function _makeFallbackTtySession(options: {
  stdin: TerminalInputStream;
  stderr: TerminalOutputStream;
  env: Readonly<Record<string, string | undefined>>;
}): TerminalSession | undefined {
  const { stdin, stderr, env } = options;
  if (stdin.isTTY !== true || stderr.isTTY !== true) {
    return undefined;
  }

  return {
    input: stdin,
    output: stderr,
    isColorEnabled: isColorEnabledForStream({ stream: stderr, env }),
    isRawModeSupported: _isRawModeAllowed({ input: stdin, env }),
    close: () => {
      if (stdin.isRaw && typeof stdin.setRawMode === "function") {
        stdin.setRawMode(false);
      }
      stdin.pause?.();
      return Promise.resolve();
    },
  };
}

/**
 * Opens an interactive terminal session bound to `/dev/tty` when a controlling
 * terminal is attached, or falls back to `stdin` and `stderr` only when both
 * are TTYs. Returns `undefined` in unattended, CI, or fully piped contexts.
 *
 * Used by interactive prompt helpers and `runCli` so prompts never consume
 * piped `stdin` or pollute machine-consumable `stdout`.
 */
export async function openTerminalSession(
  options: Readonly<TerminalSessionOptions> = {},
): Promise<TerminalSession | undefined> {
  if (options.interactive === false) {
    return undefined;
  }

  if (options.session) {
    return {
      ...options.session,
      close: async () => {},
    };
  }

  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;

  const isForceInteractive = options.interactive === true;
  const isCiEnvironment = env.CI === "true" || env.CI === "1";
  if (!isForceInteractive && isCiEnvironment) {
    return undefined;
  }

  const hasAttachedTty = Boolean(stdin.isTTY || stdout.isTTY || stderr.isTTY);
  if (!isForceInteractive && !hasAttachedTty) {
    return undefined;
  }

  const ttySession =
    options.openTty ? await options.openTty() : await _openPosixTtySession(env);

  return ttySession ?? _makeFallbackTtySession({ stdin, stderr, env });
}
