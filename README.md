# Acclimate

A lightweight TypeScript framework for building type-safe command line
interfaces.

This library is not complete and is still missing a lot of functionality.
We do not recommend this library be used in production.

See the To Do section at the end for what is still missing.

## Installation

```bash
npm install acclimate
```

## Quick start

```ts
import { Acclimate } from "acclimate";

const cli = Acclimate.createCli("demo-cli")
  .description("A tiny demo CLI")
  .action(() => {
    console.log("Hello, world!");
  });

Acclimate.run(cli);
```

## API

Public exports from `@avandar/acclimate`:

- `Acclimate`
- `executeCli`
- `generateHelpText`
- `createTheme`
- `stripAnsi`
- `DEFAULT_DARK_THEME_PALETTE`, `SEMANTIC_THEME_ROLES`, `ANSI_STYLE_CODES`
- `requestChoiceMenu`
- `requestTerminalInput`
- `openTerminalSession`
- `isColorEnabledForStream`
- `CliError` (with `error.code` of type `CliErrorCode`, plus `cliName`,
  `commandPath`, `hint`, and `usage`)
- Types: `IAcclimateCli`, `AnyCli`, `CliExample`, `OutputStream`,
  `CliParamScalarValue`, `CliParamDataType`, `CliPositionalParam`,
  `CliScalarPositionalParam`, `CliVariadicPositionalParam`, `CliOptionParam`,
  `CliCommandName`, `CliFullOptionName`, `CliOptionAlias`,
  `AcclimateRunOptions`, `AcclimateLogOptions`, `AcclimateStatusPrintOptions`,
  `AcclimateErrorPrintOptions`, `ExecuteCliOptions`, `RunCliOptions`,
  `GenerateHelpTextOptions`, `ChoiceMenuItem`, `ChoiceMenuOptions`,
  `RequestTerminalInputOptions`, `RequestTerminalInputResponseOptions`,
  `PromptIo`, `TerminalInputStream`, `TerminalOutputStream`, `TerminalSession`,
  `TerminalSessionOptions`, `AnsiStyleToken`, `CreateThemeOptions`,
  `SemanticRoleStyleInput`, `SemanticTheme`, `SemanticThemePalette`,
  `SemanticThemePaletteOverrides`, `SemanticThemeRole`, `ThemeInput`

### `Acclimate`

#### `Acclimate.createCli(name)`

Create a new CLI instance.

```ts
Acclimate.createCli(name: string): IAcclimateCli
```

#### `Acclimate.run(cli, options?)` and `Acclimate.execute(cli, options?)`

Run a CLI instance against `options.args` (or `process.argv.slice(2)`) and
return `Promise<number>` (`0` on success or help, `130` on prompt cancellation,
`1` on unknown flags, validation errors, or action failures) without calling
`process.exit()`.

- Calling `Acclimate.run(cli)` at a CLI entry point sets `process.exitCode` on
  non-zero exit.
- Passing injectable `{ args, stdin, stdout, stderr, env, isStdoutTTY,
isStderrTTY, terminal, promptIo, interactive, openTty, theme, onExitCode }`
  (or calling `Acclimate.execute(cli, options)`) keeps `process.exitCode`
  untouched and scopes injected IO across `.action()` via `AsyncLocalStorage`.

```ts
Acclimate.run(
  cli: AnyCli,
  options?: Readonly<AcclimateRunOptions>,
): Promise<number>

Acclimate.execute(
  cli: AnyCli,
  options?: Readonly<Omit<AcclimateRunOptions, "setProcessExitCode">>,
): Promise<number>
```

#### Semantic theming (`createTheme`, `Acclimate.theme`, `Acclimate.setTheme`, `Acclimate.resetTheme`)

See [docs/semantic-theming-and-io.md](docs/semantic-theming-and-io.md). Provides
ten dark-terminal high-contrast semantic roles (`heading`, `accent`, `value`,
`muted`, `success`, `warning`, `error`, `info`, `prompt`, `selected`) used
consistently across help text, prompts/menus, errors, and status output. ANSI
escapes are disabled automatically on redirected streams, non-empty `NO_COLOR`,
or `TERM=dumb`.

```ts
const theme = createTheme({
  stream: process.stderr,
  env: process.env,
  palette: { accent: "bright_magenta" },
});
```

#### Status helpers (`Acclimate.printSuccess`, `printInfo`, `printWarn`, `printError`)

Write semantic, plain-mode-safe status messages to `stderr` (with `✅`, `ℹ️`,
`⚠️`, and `❌` plus an optional indented `  ⚠️ <hint>` recovery line on
`printError`):

```ts
Acclimate.printSuccess("Checks passed");
Acclimate.printInfo("Scanning workspace...");
Acclimate.printWarn("Using fallback cache");
Acclimate.printError("Could not authenticate", {
  hint: "Run gh auth login and retry.",
});
```

#### `Acclimate.log(message, params?, options?)`

Write conversational progress or diagnostics to `stderr` (keeping `stdout` clean
for machine-consumable data). Supports `$varName$` interpolation, raw `|<COLOR>|`
tokens, and semantic `|<ROLE>|` tokens, stripping color automatically on
redirected streams, non-empty `NO_COLOR`, or `TERM=dumb`.

```ts
Acclimate.log(
  message: string,
  params?: Record<string, string | boolean | number | null | undefined>,
  options?: Readonly<AcclimateLogOptions>,
): void
```

#### `Acclimate.writeData(data, options?)` and `Acclimate.writeJson(value, options?)`

Write intentional machine-consumable text or JSON strictly to `stdout` with zero
ANSI styling or diagnostic chatter.

```ts
Acclimate.writeData(
  data: string,
  options?: { stream?: TerminalOutputStream; trailingNewline?: boolean },
): void

Acclimate.writeJson(
  value: unknown,
  options?: { stream?: TerminalOutputStream; pretty?: boolean },
): void
```

#### `Acclimate.requestChoice(options)` and `Acclimate.requestInput(options)`

Prompt interactively on the controlling terminal (`/dev/tty`, falling back to
`stdin` + `stderr` only when both are TTYs) without touching `stdout` or
consuming piped `stdin`. Choice menus support `Up`/`Down`, `j`/`k` wrapping,
`g`/`G` jumps, `1`-`9`, `Enter` confirm, and `Ctrl-C`/`EOF` cancellation that
restores raw terminal mode.

#### `executeCli(options)`

Async execution boundary for embedding or testing a CLI with injectable
`input`, `stdin`, `stdout`, `stderr`, `env`, `terminal`, `interactive`,
`openTty`, and `onExitCode`. Resolves to `0` on success or help output, `130`
on prompt cancellation, and `1` on other failures.

```ts
executeCli(options: Readonly<ExecuteCliOptions>): Promise<number>
```

#### `generateHelpText(cli, options?)`

Render formatted usage and help text for a CLI or sub-command using Acclimate's
semantic theme (or plain text when `color: false`, redirected, `NO_COLOR`, or
`TERM=dumb`).

```ts
generateHelpText(
  cli: IAcclimateCli,
  options?: Readonly<GenerateHelpTextOptions>,
): string
```

### `IAcclimateCli` (CLI builder)

`createCli()` returns an immutable builder. Each method returns a new CLI
instance with updated configuration.

#### `cli.description(description)`

```ts
cli.description(description: string): IAcclimateCli
```

#### `cli.usage(usage)`

Override the auto-generated `Usage` synopsis line in help output.

```ts
cli.usage(usage: string): IAcclimateCli
```

#### `cli.addExample(example)`

Add a worked example shown in the `Examples` section of help output.

```ts
cli.addExample(
  example: string | { command: string; description?: string },
): IAcclimateCli
```

#### `cli.action(action)`

Set the function executed when the CLI matches (after parsing). Supports both
synchronous and `async` callbacks.

```ts
cli.action(
  action: (args: FullCliArgValues<...>) => void | Promise<void>,
): IAcclimateCli
```

#### `cli.addPositionalArg(param)`

Add a positional argument. Positional args are parsed in order.

```ts
cli.addPositionalArg(param: CliPositionalParam): IAcclimateCli
```

#### `cli.addOption(param)`

Add an option local to this CLI level.

```ts
cli.addOption(param: CliOptionParam): IAcclimateCli
```

#### `cli.addGlobalOption(param)`

Add an option that is available to this CLI and all sub-commands.

```ts
cli.addGlobalOption(param: CliOptionParam): IAcclimateCli
```

#### `cli.addCommand(commandName, commandCli)`

Add a sub-command (a nested CLI). If the first positional token matches a
command name, parsing continues using that command's CLI.

```ts
cli.addCommand(
  commandName: string,
  commandCli: IAcclimateCli,
): IAcclimateCli
```

#### `cli.getCommandCli(commandName)`

Get a command CLI by name (throws if missing).

```ts
cli.getCommandCli(commandName: string): IAcclimateCli
```

### Param config types

Acclimate uses config objects to describe positional args and options.

- **Positional args**: `CliPositionalParam` (`CliScalarPositionalParam | CliVariadicPositionalParam`)
  - **name**: `string` (prefer `camelCase` to match runtime parsing)
  - **type**: `"string" | "number" | "boolean"`
  - **required**: `boolean` (for variadic args: `true` = one-or-more, `false` = zero-or-more)
  - **variadic?**: `boolean` (when `true`, captures all remaining positional arguments as a typed array; must be the last positional argument)
  - **description?**: `string`
  - **defaultValue?**: scalar value matching `type`, or a readonly array of values when `variadic: true`
  - **choices?**: allowed values list (`readonly`) enforced on every parsed value
  - **parser?**: `(value: string) => value` (runs per element when `variadic: true`)
  - **validator?**: `(value) => true | string` (runs per element when `variadic: true`)

- **Options**: `CliOptionParam`
  - **name**: `--${string}` (example: `--dry-run`)
  - **aliases?**: `readonly ("--x" | "-x")[]`
  - **required**: `boolean`
  - Same `type`, `defaultValue`, `choices`, `parser`, `validator` fields as a
    scalar positional arg

### Parsing behavior

See [docs/argument-parsing.md](docs/argument-parsing.md) for full details.

- **Positional args**: fixed positional args are parsed in order. A trailing
  `variadic: true` positional arg collects all remaining positional tokens as a
  typed array (defaulting to `[]` or a fresh copy of `defaultValue` when
  optional and omitted). Extra positional args without a variadic arg throw
  `CliError` (`too_many_positional_args`).
- **Interleaved flags and positional args**: options and positional arguments
  may be mixed in any order (before, between, or after each other). Global
  options may also appear before or after a sub-command name.
- **Value-taking options (`string` / `number`)**: consume a single following
  token (`--format json`) or an inline value after `=` (`--format=json`,
  `-f=json`). Pass multi-word values as one quoted shell token. Missing values
  throw `CliError` (`missing_option_value`).
- **Boolean flags**: `--flag` with no value parses as `true` without consuming
  the next token; pass `--flag=false` or `--flag=true` to set an explicit value.
- **End-of-options separator (`--`)**: every token after `--` is treated
  verbatim as a positional argument (never as an option or sub-command).
- **Option keys in `action(args)`**: option names are camel-cased, so
  `--dry-run` becomes `dryRun`.
- **Built-in help (`-h` / `--help`)**: supported automatically at root and
  every sub-command, taking precedence over validation, prompts, other flag
  errors, and command actions (zero side effects). Prints complete usage
  (purpose, synopsis, positional args, options, inherited global options,
  choices, defaults, examples, and sub-commands) to `stdout` and exits `0`.
  Tokens after `--` pass through verbatim as positional args.
- **Interactive menus, `/dev/tty`, and unattended fallback**: See
  [docs/interactive-prompts.md](docs/interactive-prompts.md). Parameters with
  `askIfEmpty` use interactive choice menus for `choices` and `boolean` values
  on `/dev/tty` (`Up`/`Down`, `j`/`k` wrapping, `g`/`G`, `Enter`, `Ctrl-C`/`EOF`),
  and bare actionless multi-command CLIs open a sub-command selector menu.
  Without a TTY, in CI, or with built-in `--no-prompt`, missing required values
  fail promptly with an actionable flag/invocation hint instead of hanging, and
  optional values use defaults.
- **Errors**: unknown flags before `--`, missing option values, missing required
  args/options, invalid numbers, values outside `choices`, and failed validators
  fail with `CliError` (`code`, `commandPath`, `hint`, `usage`). When run via
  `Acclimate.run(cli)` or `executeCli`, errors print a red message, an indented
  yellow recovery hint, and command usage to `stderr` (stripping color when
  redirected or `NO_COLOR` is set), leave `stdout` empty, and exit nonzero
  (`130` for `prompt_cancelled`, `1` for other failures).

## Prerequisites

- Node.js **18+**
- npm (bundled with Node)

## Project Layout

- `src/` — framework source code.
- `examples/` — small usage samples; `basic.ts` is runnable via `npm run demo`.
- `tests/` — Vitest suite.
- `dist/` — build output generated by `tsup`.

## Setup

Install dependencies:

```bash
npm install
```

## Common Scripts

- `npm run dev` — build in watch mode with tsup.
- `npm run build` — produce CJS/ESM bundles and type declarations in `dist/`.
- `npm run demo` — execute the `examples/basic.ts` sample with tsx.
- `npm test` — run the Vitest suite once.
- `npm run test:watch` — run tests in watch mode.
- `npm run lint` / `npm run lint:fix` — check or auto-fix with oxlint.
- `npm run format` / `npm run format:check` — write or check oxfmt
  formatting.
- `npm run type` - check typescript types

## Running & Testing

1. Start a build (optional during development):

```bash
npm run dev
```

1. Run the sample CLI:

```bash
npm run demo
```

1. Execute tests:

```bash
npm test
```

The `prepare` script runs `npm run build`, so the package will compile
automatically when installed from a git dependency.

## Examples

### Hello world

Matches `examples/basic.ts`.

```ts
import { Acclimate } from "acclimate";

const cli = Acclimate.createCli("demo-cli").action(() => {
  console.log("Hello, world!");
});

Acclimate.run(cli);
```

### Positional args + options

```ts
import { Acclimate } from "acclimate";

const cli = Acclimate.createCli("greet")
  .addPositionalArg({
    name: "name",
    type: "string",
    required: true,
    description: "Who to greet",
  })
  .addOption({
    name: "--shout",
    type: "boolean",
    required: false,
    aliases: ["-s"] as const,
    description: "Uppercase the output",
    defaultValue: false,
  })
  .action(({ name, shout }) => {
    const message = `Hello, ${name}!`;
    console.log(shout ? message.toUpperCase() : message);
  });

Acclimate.run(cli);
```

### Variadic positional args + interleaved flags

```ts
import { Acclimate } from "@avandar/acclimate";

const coverageCmd = Acclimate.createCli("coverage")
  .description("Check coverage for zero or more paths")
  .addPositionalArg({
    name: "paths",
    type: "string",
    required: false,
    variadic: true,
    description: "Target files or directories",
  })
  .addOption({
    name: "--format",
    aliases: ["-f"] as const,
    type: "string",
    required: false,
    choices: ["stylish", "agent", "json"] as const,
    defaultValue: "stylish",
  })
  .addOption({
    name: "--no-prompt",
    type: "boolean",
    required: false,
    defaultValue: false,
  })
  .action(({ paths, format, noPrompt }) => {
    // paths: string[]
    console.log({ paths, format, noPrompt });
  });

const lintCli = Acclimate.createCli("avandar-lint").addCommand(
  "coverage",
  coverageCmd,
);

// Works with flags before, between, or after paths, and with `--` separator:
// avandar-lint coverage --format json src/a.ts src/b.ts --no-prompt
Acclimate.run(lintCli);
```

### Sub-commands + global options

```ts
import { Acclimate } from "acclimate";

const initCmd = Acclimate.createCli("init")
  .description("Initialize a project")
  .action(({ verbose }) => {
    console.log(`init (verbose=${verbose})`);
  });

const root = Acclimate.createCli("acme")
  .addGlobalOption({
    name: "--verbose",
    type: "boolean",
    required: false,
    aliases: ["-v"] as const,
    defaultValue: false,
  })
  .addCommand("init", initCmd);

Acclimate.run(root);
```

## To do

- [x] When a required option or positional arg is missing this should throw a clean user-friendly error message, rather than a stack trace. This is not an internal error.
- [x] Add semantic functions such as Acclimate.printSuccess, .printInfo, .printWarn and .printError
- [x] Allow user to configure semantic colors with Acclimate.setTheme()
- [ ] Add a beforeAll() function to handle global args
- [ ] Add semantic arguments: e.g. email (which has a default validator)
- [x] Add built-in `-h` / `--help` handling across root and sub-commands showing description, usage synopsis, parameters, choices, defaults, and examples.
- [x] Make the `description` actually get printed.
- [x] Show all CLI param descriptions if command is run with no arguments or if
      there is a param-related error.
- [x] Add helper functions to log to stdout in different colors
- [x] Add logic for `askIfEmpty` to enter an interactive mode to receive inputs
      for different params.
