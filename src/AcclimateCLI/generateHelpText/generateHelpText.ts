import { generateTerminalMessage } from "@/generateTerminalMessage";
import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
  CLIParamScalarValue,
  CLIPositionalParam,
  CLIPositionalParamName,
  IAcclimateCLI,
} from "../AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

type SectionTitle =
  | "Positional Arguments"
  | "Options"
  | "Global Options"
  | "Commands";

type HelpParam = {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
  required: boolean;
  variadic?: boolean;
  aliases?: readonly string[];
  defaultValue?:
    | CLIParamScalarValue
    | readonly string[]
    | readonly number[]
    | readonly boolean[];
};

function _formatSectionTitle(title: SectionTitle): string {
  return `|bright_yellow|${title}|reset|`;
}

function _formatParamLine(param: Readonly<HelpParam>): string {
  const description = param.description ?? "No description";
  const requiredLabel =
    param.required ? "|red|required|reset|" : "|gray|optional|reset|";
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
    `(${typeLabel})|reset| ${requiredLabel}`,
    `- |gray|${description}|reset|`,
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
  level: number;
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

function _buildHelpLines(options: {
  name: string;
  description: string | undefined;
  positionalParams: readonly HelpParam[];
  optionParams: readonly HelpParam[];
  globalOptionParams: readonly HelpParam[];
  sortedCommands: ReadonlyArray<[string, AnyCLI]>;
  level: 1 | 2;
}): string[] {
  const {
    name,
    description,
    positionalParams,
    optionParams,
    globalOptionParams,
    sortedCommands,
    level,
  } = options;
  const headerLines = [
    `|bright_cyan|${name}|reset|`,
    description !== undefined ? `  |gray|${description}|reset|` : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });

  const sections = [
    _formatSection("Positional Arguments", positionalParams),
    _formatSection("Options", optionParams),
    _formatSection("Global Options", globalOptionParams),
    _buildCommandSection({ sortedCommands, level }),
  ].filter((section) => {
    return section.length > 0;
  });

  const subCommandLines =
    level === 1 ?
      sortedCommands.flatMap(([, commandCLI]) => {
        const subCommandState = commandCLI.state as RuntimeHelpCLIState;
        return [
          "",
          ..._generateHelpTextHelper({
            name: commandCLI.getName(),
            state: subCommandState,
            level: 2,
          }).split("\n"),
        ];
      })
    : [];

  return [
    ...headerLines,
    ...sections.flatMap((section) => {
      return ["", ...section];
    }),
    ...subCommandLines,
  ];
}

type RuntimeHelpCLIState = {
  description?: string;
  positionalArgs: readonly HelpParam[];
  optionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  globalOptionArgs: Record<CLIFullOptionName, CLIOptionParam>;
  commands: Record<CLICommandName, AnyCLI>;
};

function _generateHelpTextHelper(options: {
  name: string;
  state: Readonly<RuntimeHelpCLIState>;
  level: 1 | 2;
}): string {
  const { name, state, level } = options;
  const sortedCommands = Object.entries(state.commands).sort(
    ([firstName], [secondName]) => {
      return firstName.localeCompare(secondName);
    },
  );

  const lines = _buildHelpLines({
    name,
    description: state.description,
    positionalParams: state.positionalArgs,
    optionParams: Object.values(state.optionArgs),
    globalOptionParams: Object.values(state.globalOptionArgs),
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
 * Generates formatted ANSI help text describing a CLI's name, description,
 * positional arguments (including variadic `...` markers), options, global
 * options, and sub-commands.
 *
 * Called by `runCLI` when a CLI without an action is executed, and exported
 * for direct help rendering and testing.
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
): string {
  return generateTerminalMessage(
    _generateHelpTextHelper({
      name: cli.getName(),
      state: {
        description: cli.state.description,
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
      },
      level: 1,
    }),
  );
}
