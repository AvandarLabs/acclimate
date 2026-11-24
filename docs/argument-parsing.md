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
    zero tokens throws `CLIError` with code `missing_required_positional_arg`
    (ignoring `defaultValue` when non-interactive).

### Ordering Invariants

`addPositionalArg` enforces two invariants eagerly when building a CLI:

1. A variadic positional argument must be the **last** positional argument.
   Adding any positional argument after a variadic one throws `CLIError` with
   code `invalid_positional_arg_config`.
2. Required positional arguments must precede optional positional arguments.

## Schema-Aware Tokenization and Interleaving

`tokenizeCLIInput` scans `argv` left to right using the active command's
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
  `CLIError` (`unknown_option`). Value-taking options with no value (at end of
  input, before `--`, or before another flag) throw `CLIError`
  (`missing_option_value`).

### Sub-Command Dispatch and Global Options

Before `--`, if no positional arguments and no parent-only local options have
been seen yet, a positional token matching a registered sub-command merges the
parent's `globalOptionArgs` into that sub-command and continues tokenizing the
remaining arguments against it. Global options supplied before a sub-command
are carried forward and may be overridden by later occurrences on the
sub-command.

## Parsing, Validation, Defaults, and Prompts

`parseCLIParamValue` runs for every option, scalar positional argument, and
element of a variadic positional argument:

1. **Parsing:** Runs `param.parser` when supplied; otherwise applies default
   parsing (`string` identity, base-10 `Number.parseInt` rejecting `NaN`, and
   `boolean` treating `"false"` as `false` and all other values including `""`
   as `true`).
2. **Choices:** When `choices` is configured and non-empty, rejects parsed
   values outside the allowed list with `CLIError` (`invalid_cli_param_value`).
3. **Validator:** Runs `param.validator` on each parsed value (or default
   element), throwing `CLIError` (`invalid_cli_param_value`) on `false` or a
   custom error string.
4. **Interactive prompts (`askIfEmpty`):** When a parameter receives no CLI
   input and `askIfEmpty` is set, Acclimate prompts via `requestTerminalInput`.
   For a variadic positional argument, a non-empty prompt answer becomes a
   single-element array; an empty answer falls back to `defaultValue` when
   configured or `[]` when optional.

## Help Text and Error Codes

- `generateHelpText` formats variadic positional arguments with a trailing
  `...` on the name and `[]` on the type (for example
  `paths... (string[]) optional`).
- `CLIError` is exported from `@avandar/acclimate` and exposes a machine-readable
  `code` property (`invalid_positional_arg_config`, `too_many_positional_args`,
  `missing_required_positional_arg`, `missing_required_option`,
  `missing_option_value`, `unknown_option`, `invalid_cli_param_value`,
  `unknown_command`, `already_run`, `unknown_error`).
