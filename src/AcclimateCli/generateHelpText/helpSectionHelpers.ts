import type {
  AnyCli,
  CliCommandName,
  CliExample,
  CliFullOptionName,
  CliOptionParam,
  CliParamScalarValue,
} from "../AcclimateCli.types";
import type { SemanticTheme } from "@/theme/theme.types";

/** Section title strings rendered in CLI help output. */
export type HelpSectionTitle =
  | "Usage"
  | "Positional Arguments"
  | "Options"
  | "Global Options"
  | "Examples"
  | "Commands";

/** Normalized parameter shape rendered in help option and positional sections. */
export type HelpParam = {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
  required: boolean;
  variadic?: boolean;
  aliases?: readonly string[];
  choices?: readonly CliParamScalarValue[];
  defaultValue?:
    | CliParamScalarValue
    | readonly string[]
    | readonly number[]
    | readonly boolean[];
};

/** Runtime view of CLI state needed to render help output. */
export type RuntimeHelpCliState = {
  aliases: Record<string, CliFullOptionName>;
  description?: string;
  usage?: string;
  examples: readonly CliExample[];
  positionalArgs: readonly HelpParam[];
  optionArgs: Record<CliFullOptionName, CliOptionParam>;
  globalOptionArgs: Record<CliFullOptionName, CliOptionParam>;
  commands: Record<CliCommandName, AnyCli>;
  action?: unknown;
};

type BuildSynopsisOptions = {
  displayName: string;
  state: Readonly<RuntimeHelpCliState>;
  hasCommands: boolean;
  hasAnyOptions: boolean;
};

function _formatParamLine(options: {
  param: Readonly<HelpParam>;
  theme: Readonly<SemanticTheme>;
}): string {
  const { param, theme } = options;
  const description = param.description ?? "No description";
  const requiredLabel = param.required
    ? theme.error("required")
    : theme.muted("optional");
  const choicesLabel =
    param.choices && param.choices.length > 0
      ? theme.muted(`[choices: ${param.choices.join(" | ")}]`)
      : undefined;
  const defaultLabel =
    param.defaultValue !== undefined
      ? theme.muted(`[default: ${JSON.stringify(param.defaultValue)}]`)
      : undefined;
  const aliasList =
    param.aliases && param.aliases.length > 0 ? param.aliases.join(", ") : "";
  const baseName = param.variadic === true ? `${param.name}...` : param.name;
  const displayName = aliasList ? `${baseName}, ${aliasList}` : baseName;
  const typeLabel = param.variadic === true ? `${param.type}[]` : param.type;

  return [
    `  ${theme.value(displayName)}`,
    `(${typeLabel}) ${requiredLabel}`,
    `- ${theme.muted(description)}`,
    choicesLabel,
    defaultLabel,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Formats a named parameter section (positional arguments, options, or global
 * options) using the active semantic theme. Called by `generateHelpText`.
 */
export function formatHelpParamSection(options: {
  title: HelpSectionTitle;
  params: readonly HelpParam[];
  theme: Readonly<SemanticTheme>;
}): string[] {
  const { title, params, theme } = options;
  if (params.length === 0) {
    return [];
  }
  return [
    theme.heading(title),
    ...params.map((param) => {
      return _formatParamLine({ param, theme });
    }),
  ];
}

/**
 * Returns the built-in `--help` / `-h` help descriptor when the CLI has not
 * registered its own `--help` option. Called by `generateHelpText`.
 */
export function getBuiltinHelpOption(
  state: Readonly<RuntimeHelpCliState>,
): HelpParam | undefined {
  const hasExplicitHelp =
    state.optionArgs["--help"] !== undefined ||
    state.globalOptionArgs["--help"] !== undefined ||
    state.aliases["--help"] !== undefined;

  return hasExplicitHelp
    ? undefined
    : {
        name: "--help",
        aliases: state.aliases["-h"] !== undefined ? [] : ["-h"],
        type: "boolean",
        required: false,
        description: "Show help for this command",
      };
}

/**
 * Formats the `Usage` heading and synopsis line for a top-level help block.
 * Called by `generateHelpText`.
 */
export function formatHelpUsageSection(
  options: Readonly<BuildSynopsisOptions> & { theme: Readonly<SemanticTheme> },
): string[] {
  const { displayName, state, hasCommands, hasAnyOptions, theme } = options;
  if (state.usage !== undefined) {
    return [theme.heading("Usage"), `  ${state.usage}`];
  }

  const commandToken = !hasCommands
    ? undefined
    : state.action === undefined && state.positionalArgs.length === 0
      ? "<command>"
      : "[command]";
  const positionalTokens = state.positionalArgs.map((param) => {
    const nameToken = param.variadic === true ? `${param.name}...` : param.name;
    return param.required ? `<${nameToken}>` : `[${nameToken}]`;
  });
  const synopsis = [
    displayName,
    commandToken,
    ...positionalTokens,
    hasAnyOptions ? "[options]" : undefined,
  ]
    .filter((token): token is string => {
      return token !== undefined;
    })
    .join(" ");

  return [theme.heading("Usage"), `  ${synopsis}`];
}

/**
 * Formats the `Examples` section with themed commands and optional descriptions.
 * Called by `generateHelpText`.
 */
export function formatHelpExamplesSection(options: {
  examples: readonly CliExample[];
  theme: Readonly<SemanticTheme>;
}): string[] {
  const { examples, theme } = options;
  if (examples.length === 0) {
    return [];
  }
  const formattedExamples = examples.map((example) => {
    const command = typeof example === "string" ? example : example.command;
    const description =
      typeof example === "string" ? undefined : example.description;
    return description !== undefined
      ? `  ${theme.value(command)} - ${theme.muted(description)}`
      : `  ${theme.value(command)}`;
  });
  return [theme.heading("Examples"), ...formattedExamples];
}

/**
 * Formats the `Commands` section header (at level 1) or bulleted command list
 * (at level 2). Called by `generateHelpText`.
 */
export function formatHelpCommandSection(options: {
  sortedCommands: ReadonlyArray<[string, AnyCli]>;
  level: 1 | 2;
  theme: Readonly<SemanticTheme>;
}): string[] {
  const { sortedCommands, level, theme } = options;
  if (sortedCommands.length === 0) {
    return [];
  }
  if (level === 2) {
    const bullets = sortedCommands.map(([commandName, commandCli]) => {
      const description = commandCli.state.description ?? "No description";
      return `  • ${theme.value(commandName)} - ${theme.muted(description)}`;
    });
    return [theme.heading("Commands"), ...bullets];
  }
  // At level 1, render only the header; sub-commands expand below.
  return [theme.heading("Commands")];
}
