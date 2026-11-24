import type {
  PromptIo,
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { ThemeInput } from "@/theme/theme.types";

/** Single selectable option rendered inside an interactive choice menu. */
export type ChoiceMenuItem<TValue extends string = string> = {
  /** Value returned when this item is selected. */
  value: TValue;

  /** Primary display label shown in the menu. Defaults to `value`. */
  label?: string;

  /** Optional secondary description rendered beside the label. */
  description?: string;
};

/** Configuration for displaying an interactive choice menu prompt. */
export type ChoiceMenuOptions<TValue extends string = string> = {
  /** Prompt heading shown above the choices. */
  message: string;

  /** Ordered list of selectable items (must contain at least one entry). */
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;

  /** Initial value highlighted when the menu opens. Defaults to first item. */
  defaultValue?: TValue;

  /** Optional hint line shown beside or below the heading. */
  hint?: string;

  /** Optional pre-opened terminal session (useful in tests or wizards). */
  terminal?: TerminalSession;

  /** Optional lightweight prompt IO pair converted into a terminal session. */
  promptIo?: PromptIo;

  /** Optional input stream used when opening a terminal session. */
  stdin?: TerminalInputStream;

  /** Optional stdout stream inspected for attached-TTY checks. */
  stdout?: TerminalOutputStream;

  /** Optional stderr stream used for fallback TTY prompts. */
  stderr?: TerminalOutputStream;

  /** Environment map inspected for `CI`, `NO_COLOR`, and `TERM`. */
  env?: Readonly<Record<string, string | undefined>>;

  /** Custom controlling-terminal opener for deterministic testing. */
  openTty?: () => Promise<TerminalSession | undefined>;

  /** Explicit interactive override (`false` disables prompting). */
  interactive?: boolean;

  /** CLI name used in cancellation or unattended error messages. */
  cliName?: string;

  /** Optional semantic theme or palette overrides for menu styling. */
  theme?: ThemeInput;
};
