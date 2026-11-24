import { generateTerminalMessage } from "@/generateTerminalMessage";
import type {
  AnyCLI,
  CLICommandName,
  CLIExample,
  CLIFullOptionName,
  CLIOptionParam,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIPositionalParamName,
  IAcclimateCLI,
} from "../AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

type SectionTitle =
  | "Usage"
  | "Positional Arguments"
  | "Options"
  | "Global Options"
  | "Examples"
  | "Commands";

type HelpParam = {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
  required: boolean;
  variadic?: boolean;
  aliases?: readonly string[];
  choices?: readonly CLIParamScalarValue[];
  defaultValue?:
    | CLIParamScalarValue
    | readonly string[]
    | readonly number[]
    | readonly boolean[];
};

type RuntimeHelpCLIState = {
  aliases: Record<string, CLIFullOptionName>;
  description?: string;
  usage?: string;
  examples: readonly CLIExample[];
  positionalArgs: readonly HelpParam[];
  optionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  globalOptionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  commands: Record<CLICommandName, AnyCLI>;
  action?: unknown;
};

type BuildHelpLinesOptions = {
  displayName: string;
  state: Readonly<RuntimeHelpCLIState>;
  sortedCommands: ReadonlyArray<[string, AnyCLI]>;
  level: 1 | 2;
};

function _formatSectionTitle(title: SectionTitle): string {
  return `|bright_yellow|${title}|reset|`;
}

function _formatParamLine(param: Readonly<HelpParam>): string {
  const description = param.description ?? "No description";
  const requiredLabel =
    param.required ? "|red|required|reset|" : "|gray|optional|reset|";
  const choicesLabel =
    param.choices && param.choices.length > 0 ?
      `|gray|[choices: ${param.choices.join(" | ")}]|reset|`
    : undefined;
  const defaultLabel =
    param.defaultValue !== undefined ?
      `|gray|[default: ${JSON.stringify(param.defaultValue)}]|reset|`
    : undefined;
  const aliasList =
    param.aliases && param.aliases.length > 0 ? param.aliases.join(", ") : "";
  const baseName = param.variadic === true ? `${param.name}...` : param.name;
  const displayName = aliasList ? `${baseName}, ${aliasList}` : baseName;
  const typeLabel = param.variadic === true ? `${param.type}[]` : param.type;

  const segments = [
    `  |bright_white|${displayName}|reset|`,
    `(${typeLabel}) ${requiredLabel}`,
    `- |gray|${description}|reset|`,
    choicesLabel,
    defaultLabel,
  ].filter(Boolean);

  return segments.join(" ");
}

function _formatSection(
  title: SectionTitle,
  params: readonly HelpParam[],
): string[] {
  if (params.length === 0) {
    return [];
  }

  return [_formatSectionTitle(title), ...params.map(_formatParamLine)];
}

function _getBuiltinHelpOption(
  state: Readonly<RuntimeHelpCLIState>,
): HelpParam | undefined {
  const hasExplicitHelp =
    state.optionArgs["--help"] !== undefined ||
    state.globalOptionArgs["--help"] !== undefined ||
    state.aliases["--help"] !== undefined;

  return hasExplicitHelp ? undefined : (
      {
        name: "--help",
        aliases: state.aliases["-h"] !== undefined ? [] : ["-h"],
        type: "boolean",
        required: false,
        description: "Show help for this command",
      }
    );
}

type BuildSynopsisOptions = {
  displayName: string;
  state: Readonly<RuntimeHelpCLIState>;
  hasCommands: boolean;
  hasAnyOptions: boolean;
};

function _buildSynopsis(options: Readonly<BuildSynopsisOptions>): string {
  const { displayName, state, hasCommands, hasAnyOptions } = options;
  if (state.usage !== undefined) {
    return state.usage;
  }

  const commandToken =
    !hasCommands ? undefined
    : state.action === undefined && state.positionalArgs.length === 0 ?
      "<command>"
    : "[command]";
  const positionalTokens = state.positionalArgs.map((param) => {
    const nameToken = param.variadic === true ? `${param.name}...` : param.name;
    return param.required ? `<${nameToken}>` : `[${nameToken}]`;
  });
  const optionsToken = hasAnyOptions ? "[options]" : undefined;

  return [displayName, commandToken, ...positionalTokens, optionsToken]
    .filter((token): token is string => {
      return token !== undefined;
    })
    .join(" ");
}

function _formatExamplesSection(examples: readonly CLIExample[]): string[] {
  if (examples.length === 0) {
    return [];
  }

  const formattedExamples = examples.map((example) => {
    const command = typeof example === "string" ? example : example.command;
    const description =
      typeof example === "string" ? undefined : example.description;
    return description !== undefined ?
        `  |bright_white|${command}|reset| - |gray|${description}|reset|`
      : `  |bright_white|${command}|reset|`;
  });

  return [_formatSectionTitle("Examples"), ...formattedExamples];
}

function _formatCommandBullets(
  commands: ReadonlyArray<{ name: string; description?: string }>,
): string[] {
  return commands.map(({ name, description }) => {
    const descLabel =
      description !== undefined ?
        `|gray|${description}|reset|`
      : `|dim|No description|reset|`;
    return `  • |bright_white|${name}|reset| - ${descLabel}`;
  });
}

function _buildCommandSection(options: {
  sortedCommands: ReadonlyArray<[string, AnyCLI]>;
  level: 1 | 2;
}): string[] {
  const { sortedCommands, level } = options;
  if (sortedCommands.length === 0) {
    return [];
  }
  if (level === 2) {
    const commandsWithDescriptions = sortedCommands.map(
      ([commandName, commandCLI]) => {
        return {
          name: commandName,
          description: commandCLI.state.description,
        };
      },
    );
    return [
      _formatSectionTitle("Commands"),
      ..._formatCommandBullets(commandsWithDescriptions),
    ];
  }
  // At level 1, render only the header; sub-commands expand below.
  return [_formatSectionTitle("Commands")];
}

function _buildHeaderLines(options: {
  displayName: string;
  description: string | undefined;
}): string[] {
  return [
    `|bright_cyan|${options.displayName}|reset|`,
    options.description !== undefined ?
      `  |gray|${options.description}|reset|`
    : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });
}

function _buildSubCommandLines(
  sortedCommands: ReadonlyArray<[string, AnyCLI]>,
): string[] {
  return sortedCommands.flatMap(([, commandCLI]) => {
    const subCommandState = commandCLI.state as RuntimeHelpCLIState;
    return [
      "",
      ..._generateHelpTextHelper({
        displayName: commandCLI.getName(),
        state: subCommandState,
        level: 2,
      }).split("\n"),
    ];
  });
}

function _buildHelpLines(options: Readonly<BuildHelpLinesOptions>): string[] {
  const { displayName, state, sortedCommands, level } = options;
  const builtinHelpOption =
    level === 1 ? _getBuiltinHelpOption(state) : undefined;
  const optionParams: HelpParam[] = [
    ...Object.values(state.optionArgs),
    ...(builtinHelpOption ? [builtinHelpOption] : []),
  ];
  const globalOptionParams = Object.values(state.globalOptionArgs);
  const hasAnyOptions =
    optionParams.length > 0 || globalOptionParams.length > 0;
  const usageSection =
    level === 1 ?
      [
        _formatSectionTitle("Usage"),
        `  ${_buildSynopsis({
          displayName,
          state,
          hasCommands: sortedCommands.length > 0,
          hasAnyOptions,
        })}`,
      ]
    : [];

  const sections = [
    usageSection,
    _formatSection("Positional Arguments", state.positionalArgs),
    _formatSection("Options", optionParams),
    _formatSection("Global Options", globalOptionParams),
    level === 1 ? _formatExamplesSection(state.examples) : [],
    _buildCommandSection({ sortedCommands, level }),
  ].filter((section) => {
    return section.length > 0;
  });

  return [
    ..._buildHeaderLines({ displayName, description: state.description }),
    ...sections.flatMap((section) => {
      return ["", ...section];
    }),
    ...(level === 1 ? _buildSubCommandLines(sortedCommands) : []),
  ];
}

function _generateHelpTextHelper(options: {
  displayName: string;
  state: Readonly<RuntimeHelpCLIState>;
  level: 1 | 2;
}): string {
  const { displayName, state, level } = options;
  const sortedCommands = Object.entries(state.commands).sort(
    ([firstName], [secondName]) => {
      return firstName.localeCompare(secondName);
    },
  );

  const lines = _buildHelpLines({
    displayName,
    state,
    sortedCommands,
    level,
  });

  const indent = "    ".repeat(Math.max(0, level - 1));
  return lines
    .map((line) => {
      return line === "" ? "" : `${indent}${line}`;
    })
    .join("\n");
}

/**
 * Generates formatted ANSI help text describing a CLI's name or full command
 * path, purpose, usage synopsis, positional arguments, options (including
 * built-in `--help, -h`), global options, choices, defaults, examples, and
 * sub-commands.
 *
 * Used for `-h`/`--help` and error usage output (for example from `runCLI` or
 * custom help inspection in tests).
 */
export function generateHelpText<
  TPositionalParams extends
    | Record<CLIPositionalParamName, CLIPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CLIFullOptionName, CLIOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CLIFullOptionName, CLIOptionParam>
    | EmptyObject,
  TCommands extends Record<CLICommandName, AnyCLI> | EmptyObject,
>(
  cli: IAcclimateCLI<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  options?: { commandPath?: readonly string[] },
): string {
  const displayName =
    options?.commandPath && options.commandPath.length > 0 ?
      options.commandPath.join(" ")
    : cli.getName();

  return generateTerminalMessage(
    _generateHelpTextHelper({
      displayName,
      state: {
        aliases: cli.state.aliases as Record<string, CLIFullOptionName>,
        description: cli.state.description,
        usage: cli.state.usage,
        examples: cli.state.examples,
        positionalArgs: cli.state.positionalArgs,
        optionArgs: cli.state.optionArgs as Record<
          CLIFullOptionName,
          CLIOptionParam
        >,
        globalOptionArgs: cli.state.globalOptionArgs as Record<
          CLIFullOptionName,
          CLIOptionParam
        >,
        commands: cli.state.commands as Record<CLICommandName, AnyCLI>,
        action: cli.state.action,
      },
      level: 1,
    }),
  );
}
