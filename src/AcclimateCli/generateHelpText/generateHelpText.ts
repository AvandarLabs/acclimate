import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import {
  formatHelpCommandSection,
  formatHelpExamplesSection,
  formatHelpParamSection,
  formatHelpUsageSection,
  getBuiltinHelpOption,
} from "./helpSectionHelpers";
import type {
  AnyCli,
  CliCommandName,
  CliExample,
  CliFullOptionName,
  CliOptionParam,
  CliPositionalParam,
  CliPositionalParamName,
  IAcclimateCli,
} from "../AcclimateCli.types";
import type { HelpParam, RuntimeHelpCliState } from "./helpSectionHelpers";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";
import type { SemanticTheme, ThemeInput } from "@/theme/theme.types";
import type { EmptyObject } from "type-fest";

/**
 * Options controlling `generateHelpText` command path, theme, and plain mode.
 */
export type GenerateHelpTextOptions = {
  commandPath?: readonly string[];
  color?: boolean;
  theme?: ThemeInput;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};

type BuildHelpLinesOptions = {
  displayName: string;
  state: Readonly<RuntimeHelpCliState>;
  sortedCommands: ReadonlyArray<[string, AnyCli]>;
  level: 1 | 2;
  theme: Readonly<SemanticTheme>;
};

function _buildHeaderLines(options: {
  displayName: string;
  description: string | undefined;
  theme: Readonly<SemanticTheme>;
}): string[] {
  const { displayName, description, theme } = options;
  return [
    theme.accent(displayName),
    description !== undefined ? `  ${theme.muted(description)}` : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });
}

function _buildSubCommandLines(options: {
  sortedCommands: ReadonlyArray<[string, AnyCli]>;
  theme: Readonly<SemanticTheme>;
}): string[] {
  const { sortedCommands, theme } = options;
  return sortedCommands.flatMap(([, commandCli]) => {
    const subCommandState = commandCli.state;
    return [
      "",
      ..._generateHelpTextHelper({
        displayName: commandCli.getName(),
        state: subCommandState,
        level: 2,
        theme,
      }).split("\n"),
    ];
  });
}

function _buildHelpSections(
  options: Readonly<BuildHelpLinesOptions>,
): string[][] {
  const { displayName, state, sortedCommands, level, theme } = options;
  const builtinHelp = level === 1 ? getBuiltinHelpOption(state) : undefined;
  const optionParams: HelpParam[] = [
    ...Object.values(state.optionArgs),
    ...(builtinHelp ? [builtinHelp] : []),
  ];
  const globalOptionParams = Object.values(state.globalOptionArgs);
  const hasAnyOptions =
    optionParams.length > 0 || globalOptionParams.length > 0;
  return [
    level === 1
      ? formatHelpUsageSection({
          displayName,
          state,
          hasCommands: sortedCommands.length > 0,
          hasAnyOptions,
          theme,
        })
      : [],
    formatHelpParamSection({
      title: "Positional Arguments",
      params: state.positionalArgs,
      theme,
    }),
    formatHelpParamSection({ title: "Options", params: optionParams, theme }),
    formatHelpParamSection({
      title: "Global Options",
      params: globalOptionParams,
      theme,
    }),
    level === 1
      ? formatHelpExamplesSection({ examples: state.examples, theme })
      : [],
    formatHelpCommandSection({ sortedCommands, level, theme }),
  ].filter((section) => {
    return section.length > 0;
  });
}

function _buildHelpLines(options: Readonly<BuildHelpLinesOptions>): string[] {
  const { displayName, state, sortedCommands, level, theme } = options;
  const sections = _buildHelpSections(options);
  return [
    ..._buildHeaderLines({
      displayName,
      description: state.description,
      theme,
    }),
    ...sections.flatMap((section) => {
      return ["", ...section];
    }),
    ...(level === 1 ? _buildSubCommandLines({ sortedCommands, theme }) : []),
  ];
}

function _generateHelpTextHelper(options: {
  displayName: string;
  state: Readonly<RuntimeHelpCliState>;
  level: 1 | 2;
  theme: Readonly<SemanticTheme>;
}): string {
  const { displayName, state, level, theme } = options;
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
    theme,
  });
  const indent = "    ".repeat(Math.max(0, level - 1));
  return lines
    .map((line) => {
      return line === "" ? "" : `${indent}${line}`;
    })
    .join("\n");
}

type RawHelpStateInput = {
  aliases: Record<string, string>;
  description?: string;
  usage?: string;
  examples: readonly CliExample[];
  positionalArgs: readonly HelpParam[];
  optionArgs: Record<string, unknown>;
  globalOptionArgs: Record<string, unknown>;
  commands: Record<string, unknown>;
  action?: unknown;
};

function _toRuntimeHelpState(
  rawState: Readonly<RawHelpStateInput>,
): RuntimeHelpCliState {
  return {
    aliases: rawState.aliases as Record<string, CliFullOptionName>,
    description: rawState.description,
    usage: rawState.usage,
    examples: rawState.examples,
    positionalArgs: rawState.positionalArgs,
    optionArgs: rawState.optionArgs as Record<
      CliFullOptionName,
      CliOptionParam
    >,
    globalOptionArgs: rawState.globalOptionArgs as Record<
      CliFullOptionName,
      CliOptionParam
    >,
    commands: rawState.commands as Record<CliCommandName, AnyCli>,
    action: rawState.action,
  };
}

/**
 * Generates formatted help text using Acclimate's semantic theme (or plain text
 * when color is disabled by stream TTY status, `NO_COLOR`, or `TERM=dumb`),
 * covering command path, purpose, usage synopsis, parameters, choices,
 * defaults, examples, and sub-commands.
 *
 * Used for `-h`/`--help`, error usage output, and custom help inspection.
 */
export function generateHelpText<
  TPositionalParams extends
    | Record<CliPositionalParamName, CliPositionalParam>
    | EmptyObject,
  TOptionParams extends Record<CliFullOptionName, CliOptionParam> | EmptyObject,
  TGlobalOptionParams extends
    | Record<CliFullOptionName, CliOptionParam>
    | EmptyObject,
  TCommands extends Record<CliCommandName, AnyCli> | EmptyObject,
>(
  cli: IAcclimateCli<
    TPositionalParams,
    TOptionParams,
    TGlobalOptionParams,
    TCommands
  >,
  options?: Readonly<GenerateHelpTextOptions>,
): string {
  const displayName =
    options?.commandPath && options.commandPath.length > 0
      ? options.commandPath.join(" ")
      : cli.getName();
  const theme = makeThemeFromOptions({
    theme: options?.theme,
    color: options?.color,
    stream: options?.stream,
    isTTY: options?.isTTY,
    env: options?.env,
    defaultColor: true,
  });

  return _generateHelpTextHelper({
    displayName,
    state: _toRuntimeHelpState(cli.state),
    level: 1,
    theme,
  });
}
