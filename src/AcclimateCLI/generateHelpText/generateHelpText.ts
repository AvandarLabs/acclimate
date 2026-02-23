import { generateTerminalMessage } from "@/generateTerminalMessage";
import type {
  AnyCLI,
  CLICommandName,
  CLIFullOptionName,
  CLIOptionParam,
  CLIParam,
  CLIPositionalParam,
  CLIPositionalParamName,
  IAcclimateCLI,
} from "../AcclimateCLI.types";
import type { EmptyObject } from "type-fest";

const _SECTION_TITLES = [
  "Positional Arguments",
  "Options",
  "Global Options",
  "Commands",
] as const;

type SectionTitle = (typeof _SECTION_TITLES)[number];

type CLIParamWithRequired = CLIParam<string> & {
  required: boolean;
  aliases?: readonly string[];
};

function formatSectionTitle(title: SectionTitle): string {
  return `|bright_yellow|${title}|reset|`;
}

function formatDefaultValue(
  value: CLIParamWithRequired["defaultValue"],
): string {
  return `|gray|[default: ${JSON.stringify(value)}]|reset|`;
}

function formatParamLine(param: CLIParamWithRequired): string {
  const description = param.description ?? "No description";
  const requiredLabel =
    param.required ? "|red|required|reset|" : "|gray|optional|reset|";
  const defaultLabel =
    param.defaultValue !== undefined ?
      formatDefaultValue(param.defaultValue)
    : undefined;
  const aliasList =
    param.aliases && param.aliases.length > 0 ? param.aliases.join(", ") : "";
  const displayName = aliasList ? `${param.name}, ${aliasList}` : param.name;

  const segments = [
    `  |bright_white|${displayName}|reset|`,
    `(${param.type})|reset| ${requiredLabel}`,
    `- |gray|${description}|reset|`,
    defaultLabel,
  ].filter(Boolean);

  return segments.join(" ");
}

function formatSection(
  title: SectionTitle,
  params: readonly CLIParamWithRequired[],
): string[] {
  if (params.length === 0) {
    return [];
  }

  return [formatSectionTitle(title), ...params.map(formatParamLine)];
}

function formatCommandBullets(
  commands: { name: string; description?: string }[],
): string[] {
  return commands.map(({ name, description }) => {
    const descLabel =
      description !== undefined ?
        `|gray|${description}|reset|`
      : `|dim|No description|reset|`;
    return `  • |bright_white|${name}|reset| - ${descLabel}`;
  });
}

function _generateHelpTextHelper<
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
  options: { level: 1 | 2 },
): string {
  const name = cli.getName();
  const description = cli.state.description;
  const level = Number(options.level);

  const positionalParams = cli.state
    .positionalArgs as readonly CLIParamWithRequired[];
  const optionParams = Object.values(
    cli.state.optionArgs as Record<CLIFullOptionName, CLIOptionParam>,
  ) as readonly CLIParamWithRequired[];
  const globalOptionParams = Object.values(
    cli.state.globalOptionArgs as Record<CLIFullOptionName, CLIOptionParam>,
  ) as readonly CLIParamWithRequired[];
  const sortedCommands = Object.entries(cli.state.commands).sort(([a], [b]) => {
    return a.localeCompare(b);
  });

  const headerLines = [`|bright_cyan|${name}|reset|`];
  if (description !== undefined) {
    headerLines.push(`  |gray|${description}|reset|`);
  }

  let commandSection: string[];
  if (sortedCommands.length === 0) {
    commandSection = [];
  } else if (level === 2) {
    const commandsWithDescriptions = sortedCommands.map(
      ([commandName, commandCLI]) => ({
        name: commandName,
        description: commandCLI.state.description,
      }),
    );
    commandSection = [
      formatSectionTitle("Commands"),
      ...formatCommandBullets(commandsWithDescriptions),
    ];
  } else {
    // At level 1, just show the header - sub-commands are rendered recursively below
    commandSection = [formatSectionTitle("Commands")];
  }

  const sections = [
    formatSection("Positional Arguments", positionalParams),
    formatSection("Options", optionParams),
    formatSection("Global Options", globalOptionParams),
    commandSection,
  ].filter((section) => section.length > 0);

  const lines = [...headerLines];
  sections.forEach((section, idx) => {
    lines.push("", ...section);
  });

  if (level === 1) {
    const subCommandHelpText = sortedCommands.map(([, commandCLI]) => {
      return _generateHelpTextHelper(commandCLI, { level: 2 });
    });
    if (subCommandHelpText.length > 0) {
      subCommandHelpText.forEach((text) => {
        lines.push("", ...text.split("\n"));
      });
    }
  }

  const indent = "    ".repeat(Math.max(0, level - 1));
  return lines
    .map((line) => {
      return line === "" ? "" : `${indent}${line}`;
    })
    .join("\n");
}

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
  return generateTerminalMessage(_generateHelpTextHelper(cli, { level: 1 }));
}
