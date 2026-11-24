/**
 * Readable stream contract for interactive terminal input (such as `/dev/tty`
 * or `process.stdin`), supporting optional raw-mode toggling.
 */
export type TerminalInputStream = NodeJS.ReadableStream & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  pause?: () => void;
  resume?: () => void;
};

/**
 * Writable stream contract for terminal output (`stdout`, `stderr`, or
 * `/dev/tty`), carrying optional TTY capability metadata.
 */
export type TerminalOutputStream = {
  write: (chunk: string) => unknown;
  isTTY?: boolean;
};

/**
 * Active interactive terminal session providing isolated prompt input and
 * output streams alongside color and raw-mode capabilities.
 */
export type TerminalSession = {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  isColorEnabled: boolean;
  isRawModeSupported: boolean;
  close: () => Promise<void>;
};

/**
 * Options for acquiring a controlling-terminal session via
 * `openTerminalSession`, injectable for deterministic unit testing.
 */
export type TerminalSessionOptions = {
  session?: TerminalSession;
  interactive?: boolean;
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  openTty?: () => Promise<TerminalSession | undefined>;
};

/**
 * Lightweight injectable prompt IO pair converted into a `TerminalSession`
 * for interactive tests and embedded CLI callers.
 */
export type PromptIo = {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  isColorEnabled?: boolean;
  isRawModeSupported?: boolean;
  close?: () => void | Promise<void>;
};
