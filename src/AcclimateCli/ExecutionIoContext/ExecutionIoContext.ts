import { AsyncLocalStorage } from "node:async_hooks";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { SemanticTheme } from "@/theme/theme.types";

/** Active per-run execution streams, environment, themes, and prompt IO. */
export type ExecutionIoStore = {
  stdin: TerminalInputStream;
  stdout: TerminalOutputStream;
  stderr: TerminalOutputStream;
  env: Readonly<Record<string, string | undefined>>;
  stdoutTheme: SemanticTheme;
  stderrTheme: SemanticTheme;
  terminal?: TerminalSession;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
};

const executionIoStorage = new AsyncLocalStorage<ExecutionIoStore>();

/**
 * Async-scoped storage for injected CLI streams, environment, themes, and
 * prompt IO so `Acclimate.*` helpers invoked inside command actions stay
 * isolated across concurrent in-process runs.
 *
 * Entered by `runCli` and read by `Acclimate` facade helpers.
 */
export const ExecutionIoContext = {
  /** Return the active execution IO store, or `undefined` outside a CLI run. */
  get: (): ExecutionIoStore | undefined => {
    return executionIoStorage.getStore();
  },

  /** Execute `callback` with `store` bound for its entire async call tree. */
  run: <TResult>(store: ExecutionIoStore, callback: () => TResult): TResult => {
    return executionIoStorage.run(store, callback);
  },
};
