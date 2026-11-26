# Argument Parsing

Acclimate separates raw `argv` processing into three stages: schema-aware
tokenization with sub-command dispatch, positional and option allocation
(including interactive `askIfEmpty` prompts), and per-value parsing and
validation.

## Positional Arguments

Positional arguments are registered with `cli.addPositionalArg(param)` and
parsed in declaration order:

- **Fixed (scalar) positional arguments (`variadic` omitted or `false`):**
  Consume at most one positional token each and produce a scalar value
  (`string`, `number`, or `boolean`) in `action(args)`.
- **Repeatable (variadic) positional arguments (`variadic: true`):**
  Consume all remaining positional tokens into a typed array (`string[]`,
  `number[]`, or `boolean[]`).
  - `required: false` allows zero or more tokens (`[paths...]`). When zero
    tokens are supplied, Acclimate passes a fresh copy of `defaultValue` if
    configured, or `[]` otherwise.
  - `required: true` requires at least one token (`<paths...>`). Supplying
    zero tokens throws `CliError` with code `missing_required_positional_arg`
    (ignoring `defaultValue` when non-interactive).

### Ordering Invariants

`addPositionalArg` enforces two invariants eagerly when building a CLI:

1. A variadic positional argument must be the **last** positional argument.
   Adding any positional argument after a variadic one throws `CliError` with
   code `invalid_positional_arg_config`.
2. Required positional arguments must precede optional positional arguments.

## Schema-Aware Tokenization and Interleaving

`tokenizeCliInput` scans `argv` left to right using the active command's
declared `optionArgs`, `globalOptionArgs`, `aliases`, and `commands`.

- **Free interleaving:** Positional arguments may appear before, between, or
  after options and aliases (for example
  `avandar-lint coverage src/a.ts --format json src/b.ts --no-prompt`).
- **Boolean flags:** Options with `type: "boolean"` consume zero following
  tokens when passed as `--flag` or `-f`, so an immediately following token is
  parsed as a positional argument (or sub-command). Explicit values can be
  attached with `=` (`--flag=false`, `--flag=true`).
- **Value-taking options:** Options with `type: "string"` or `type: "number"`
  consume exactly one value token (`--format json`, `-f json`) or an inline
  value after the first `=` (`--format=json`, `--define=KEY=VAL`). Multi-word
  values must be passed as a single quoted shell token.
- **End-of-options separator (`--`):** Everything after the first `--` is
  treated verbatim as a positional argument, including flag-like strings
  (`--not-a-flag`, `-x`), additional `--` tokens, and strings matching
  sub-command names.
- **Lone hyphen (`-`):** Treated as a positional argument or option value
  (following the Unix stdin/stdout convention).
- **Negative numbers:** Tokens matching negative numeric literals (such as
  `-1` or `-3.5`) are treated as option values or positional arguments unless
  explicitly registered as an option alias on the active CLI.
- **Repeated options:** When an option (or its aliases) appears more than once,
  the last value wins.
- **Unknown flags and missing values:** Unrecognized flags before `--` throw
  `CliError` (`unknown_option`). Value-taking options with no value (at end of
  input, before `--`, or before another flag) throw `CliError`
  (`missing_option_value`).

### Sub-Command Dispatch and Global Options

Before `--`, if no positional arguments and no parent-only local options have
been seen yet, a positional token matching a registered sub-command merges the
parent's `globalOptionArgs` into that sub-command and continues tokenizing the
remaining arguments against it. Global options supplied before a sub-command
are carried forward and may be overridden by later occurrences on the
sub-command.

## Parsing, Validation, Defaults, and Prompts

`parseCliParamValue` runs for every option, scalar positional argument, and
element of a variadic positional argument:

1. **Parsing:** Runs `param.parser` when supplied; otherwise applies default
   parsing (`string` identity, base-10 `Number.parseInt` rejecting `NaN`, and
   `boolean` treating `"false"` as `false` and all other values including `""`
   as `true`).
2. **Choices:** When `choices` is configured and non-empty, rejects parsed
   values outside the allowed list with `CliError` (`invalid_cli_param_value`).
3. **Validator:** Runs `param.validator` on each parsed value (or default
   element), throwing `CliError` (`invalid_cli_param_value`) on `false` or a
   custom error string.
4. **Interactive prompts (`askIfEmpty`) and unattended mode:** See
   [`docs/interactive-prompts.md`](interactive-prompts.md) for full details.
   - When an interactive controlling terminal (`/dev/tty`) is available and
     prompts are enabled, Acclimate prompts via `requestChoiceMenu` (for
     `choices` and raw-TTY `boolean` parameters) or `requestTerminalInput` (for
     free-text `string`/`number` parameters) without touching `stdout` or
     consuming piped `stdin`.
   - When no TTY is attached, `CI` is enabled, or `--no-prompt` is supplied,
     missing required `askIfEmpty` parameters fail promptly with an actionable
     `CliError` naming the flag or argument and example invocation, while
     optional parameters fall back to `defaultValue` (or `[]` / `undefined`).
   - Built-in `--no-prompt` (and `--no-prompt=true` / `--no-prompt=false`) is
     recognized before `--` at any command level even when not declared on the
     CLI, propagating into sub-commands. If a CLI explicitly declares
     `--no-prompt`, Acclimate preserves the parsed `noPrompt` argument value
     while also honoring it to disable prompting.
   - Running an actionless parent command with sub-commands bare in an
     interactive terminal opens a sub-command choice menu and recurses into the
     chosen command (carrying forward parent global options); in unattended
     mode, it writes help to `stdout`.

## Built-In Help (`-h` / `--help`)

Acclimate handles `-h` and `--help` natively at the root CLI and every nested
sub-command:

- **Precedence:** Built-in `-h` / `--help` takes precedence over required
  argument and option validation, value parsers/validators, interactive
  `askIfEmpty` prompts, other flag errors (`unknown_option`,
  `missing_option_value`), and command actions (zero side effects).
- **Output and exit status:** Help text is written to `stdout` and resolves
  cleanly with exit code `0`.
- **Sub-command context:** Invoking `<root> <subcommand> --help` prints the
  matched sub-command's help using its full command path (`<root> <subcommand>`)
  and includes all inherited parent global options.
- **End-of-options pass-through:** `-h` and `--help` appearing after `--` are
  passed verbatim as positional arguments rather than triggering help. Inline
  option values such as `--format=--help` are likewise passed as values.
- **Collision safety:** If a command explicitly registers `-h` as an alias for
  another option (such as `--host, -h`), `-h` routes to that option while
  `--help` remains built-in. If a command explicitly registers `--help`,
  Acclimate defers to that declaration.

## Help Text, Metadata, and Error Reporting

- `generateHelpText(cli, { commandPath? })` renders:
  - Command name or full invocation path and purpose (`description`).
  - `Usage` synopsis, auto-generated from sub-commands (`<command>` /
    `[command]`), positional arguments (`<arg>`, `[arg]`, `<arg...>`,
    `[arg...]`), and `[options]`, or overridden via `cli.usage(...)`.
  - `Positional Arguments`, `Options` (including built-in `--help, -h` at level
    1 unless overridden), and `Global Options` (including inherited parent
    globals on sub-commands), displaying variadic `...` / `[]` markers,
    `[choices: a | b]`, and `[default: ...]`.
  - `Examples` declared via `cli.addExample(example)` (either a command string
    or `{ command, description }`).
  - Alphabetically sorted `Commands`.
- `CliError` is exported from `@avandar/acclimate` and exposes:
  - `code: CliErrorCode` (`invalid_positional_arg_config`,
    `too_many_positional_args`, `missing_required_positional_arg`,
    `missing_required_option`, `missing_option_value`, `unknown_option`,
    `invalid_cli_param_value`, `unknown_command`, `already_run`,
    `prompt_cancelled`, `interactive_input_unavailable`, `unknown_error`).
  - `cliName`, optional `commandPath`, optional `hint` (`Run <cmd> --help to
see available options and usage.`, or a flag/invocation hint on unattended
    required prompt failures), and optional `usage`.
- `executeCli` (used by `Acclimate.run(cli)` and exported for programmatic
  testing/embedding) writes `CliError` output formatted by `formatCliError`
  (red error line, indented yellow `⚠️` recovery hint, and full command usage,
  automatically stripping ANSI color on redirected `stderr`, `NO_COLOR`, or
  `TERM=dumb`) to `stderr`, leaves `stdout` empty, omits raw stack traces for
  CLI input errors, and sets `process.exitCode` to `130` for `prompt_cancelled`
  or `1` for other errors without calling `process.exit()`.
