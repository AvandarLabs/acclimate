# Repeatable (Variadic) Positional Arguments & Interleaved Option Parsing Design

**Date:** 2026-11-23
**Package:** `@avandar/acclimate`
**Branch:** `jpsyx/feat/repeatable-positional-args`

## 1. Goal

Enable Acclimate CLIs to define strongly typed repeatable (variadic) positional arguments - both zero-or-more (`[paths...]`) and one-or-more (`<paths...>`) - and parse them reliably when mixed freely with options, aliases, global options, subcommands, and the `--` end-of-options separator.

Motivating example:

```sh
avandar-lint coverage --format json src/a.ts src/b.ts --no-prompt
avandar-lint coverage src/a.ts --format=agent src/b.ts
avandar-lint coverage -- -weird-path.ts
avandar-lint --verbose coverage src/a.ts
```

## 2. Design Options Considered

### Option A: `variadic: true` on `addPositionalArg` (Recommended)

Extend `CLIPositionalParam` into a discriminated union of `CLIScalarPositionalParam` (`variadic?: false`) and `CLIVariadicPositionalParam` (`variadic: true`).

- **Pros:** Matches Acclimate's declarative config-object builder API (`addPositionalArg`, `addOption`, `addGlobalOption`); keeps `IAcclimateCLI` surface compact; preserves exact contextual typing for `type`, `variadic`, `defaultValue`, `choices`, `parser`, and `validator`; 100% backwards-compatible with existing `addPositionalArg` calls.
- **Cons:** `CLIPositionalParam` becomes a union of scalar and variadic shapes, so internal code narrows on `param.variadic === true`.

### Option B: Separate `addVariadicPositionalArg` builder method

Add a second builder method alongside `addPositionalArg`.

- **Pros:** Keeps scalar and variadic method signatures physically separate.
- **Cons:** Duplicates builder logic and forces callers to remember two methods for positional arguments.

### Decision

Adopt **Option A**. Extending `addPositionalArg` with `variadic?: boolean` is idiomatic to Acclimate and gives full compile-time discrimination between scalar (`PValue`) and variadic (`PValue[]`) parameters without adding parallel builder methods.

## 3. Public TypeScript API

### Parameter Types

Param types live in `src/AcclimateCLI/CLIParam.types.ts` and are re-exported from `src/AcclimateCLI/AcclimateCLI.types.ts` and `src/index.ts`:

```ts
export type CLIParamScalarValue = string | number | boolean;

export type CLIParamDataType =
  | CLIParamScalarValue
  | string[]
  | number[]
  | boolean[]
  | undefined;

export type CLIScalarPositionalParam<PName extends string = string> =
  CLIParam<PName> & {
    required: boolean;
    variadic?: false;
  };

export type CLIVariadicStringParam<
  PName extends string,
  PValue extends string = string,
> = CLIBaseParam<PName> & {
  type: "string";
  variadic: true;
  required: boolean;
  choices?: readonly PValue[];
  defaultValue?: readonly PValue[];
  validator?: (value: PValue) => boolean | string;
  parser?: (value: string) => PValue;
};

export type CLIVariadicNumberParam<
  PName extends string,
  PValue extends number = number,
> = CLIBaseParam<PName> & {
  type: "number";
  variadic: true;
  required: boolean;
  choices?: readonly PValue[];
  defaultValue?: readonly PValue[];
  validator?: (value: PValue) => boolean | string;
  parser?: (value: string) => PValue;
};

export type CLIVariadicBooleanParam<PName extends string> =
  CLIBaseParam<PName> & {
    type: "boolean";
    variadic: true;
    required: boolean;
    defaultValue?: readonly boolean[];
    validator?: (value: boolean) => boolean | string;
    parser?: (value: string) => boolean;
  };

export type CLIVariadicPositionalParam<PName extends string = string> =
  | CLIVariadicStringParam<PName>
  | CLIVariadicNumberParam<PName>
  | CLIVariadicBooleanParam<PName>;

export type CLIPositionalParam<PName extends string = string> =
  | CLIScalarPositionalParam<PName>
  | CLIVariadicPositionalParam<PName>;
```

Key type guarantees:

- **Scalar positional args (`variadic` omitted or `false`):** `ValueOfParam<P>` resolves to `PValue` (`string`, `number`, `boolean`, or a narrower type from `parser`/`choices`). Identical to v0.4.0.
- **Variadic positional args (`variadic: true`):** `ValueOfParam<P>` resolves to `PValue[]` (`string[]`, `number[]`, `boolean[]`, or narrower element union array when `choices` is `as const` or `parser` returns a narrower type).
- **`defaultValue`:** Scalar positional args accept `PValue`; variadic positional args accept `readonly PValue[]`. Passing a scalar default to a variadic arg or an array default to a scalar arg is a compile-time error.
- **`choices`:** Widened from `PValue[]` to `readonly PValue[]` on both scalar and variadic string/number params so `choices: ["stylish", "agent", "json"] as const` compiles cleanly while remaining backwards-compatible with mutable arrays.
- **`IAcclimateCLI` generics:** The 4 generic parameters `(TPositionalParams, TOptionParams, TGlobalOptionParams, TCommands)` are unchanged, preserving full backwards compatibility with `AnyCLI` and existing consumers.
- **`CLIError`:** Exported as a named export from `src/index.ts` and exposes `readonly code: CLIErrorCode` on error instances.

### Example Usage

```ts
const coverageCLI = Acclimate.createCLI("coverage")
  .description("Check test coverage for target paths")
  .addPositionalArg({
    name: "paths",
    type: "string",
    required: false,
    variadic: true,
    description: "Paths to inspect",
  })
  .addOption({
    name: "--format",
    aliases: ["-f"] as const,
    type: "string",
    required: false,
    choices: ["stylish", "agent", "json"] as const,
    defaultValue: "stylish",
    description: "Output format",
  })
  .addOption({
    name: "--no-prompt",
    type: "boolean",
    required: false,
    defaultValue: false,
    description: "Disable interactive prompts",
  })
  .action(({ paths, format, noPrompt }) => {
    // paths: string[]
    // format: "stylish" | "agent" | "json" (when choices is as const + defaultValue as const, or string)
    // noPrompt: boolean
  });
```

## 4. Positional Argument Ordering Rules

Validated eagerly in `AcclimateCLI.addPositionalArg`:

1. **Variadic must be last:** If `state.positionalArgs` already contains a param with `variadic === true`, adding any subsequent positional arg (scalar or variadic, required or optional) throws `CLIError.invalidPositionalArgConfig` with message:
   `Variadic positional argument "<name>" must be the last positional argument`.
2. **Required before optional:** Existing rule preserved. If `param.required` is `true` and any earlier positional arg has `required === false`, throws `CLIError.invalidPositionalArgConfig` with message:
   `Required positional arguments must be before optional positional arguments`.

Valid configurations include:

- `[paths...]` (optional variadic alone)
- `<paths...>` (required variadic alone)
- `<first> [paths...]` (required fixed followed by optional variadic)
- `<first> <paths...>` (required fixed followed by required variadic)
- `<first> [second] [paths...]` (required fixed, optional fixed, optional variadic)
- `[first] [paths...]` (optional fixed followed by optional variadic)

## 5. Tokenization, Interleaving, and Subcommand Dispatch

### Tokenization Model

Tokenization replaces the v0.4.0 "split at first `-` and greedily join option tokens" logic with a schema-aware left-to-right token scanner (`tokenizeCLIInput`) that runs per command level:

1. **Before `--`:**
   - **End-of-options separator (`"--"`):** Sets `isAfterDoubleDash = true`. All subsequent tokens (including another `"--"`, `"-x"`, `"--flag"`, or subcommand names) are appended verbatim to `rawPositionalArgs`.
   - **Lone hyphen (`"-"`):** Treated as a positional argument (or option value when an option is waiting for a value), following the Unix stdin/stdout convention.
   - **Option with inline value (`--name=value` or `-a=value`):** Split on the **first** `"="` only so values containing `"="` (for example `--env=FOO=bar`) are preserved. The flag portion is resolved through `cli.state.aliases` to its canonical `CLIFullOptionName`.
     - If the resolved option is not declared in `optionArgs` or `globalOptionArgs`, throws `CLIError.unknownOption`.
     - If declared, records `inlineValue` (for both boolean and value-taking options) and consumes no additional tokens.
   - **Option without inline value (`--name` or `-a`):**
     - First check if the token matches a declared option or alias on the current CLI (including inherited global options).
     - If it is a declared option:
       - **`type === "boolean"`:** Records raw value `""` (which the default boolean parser turns into `true`, matching v0.4.0) and consumes **0** following tokens. A following non-flag token is parsed as a positional argument (or subcommand).
       - **`type === "string" | "number"`:** Transitions into `pendingOption` state so the immediately following token is consumed as its single value.
     - If it is **not** a declared option:
       - If the token is a negative numeric literal (`/^-(\d+(\.\d+)?|\.\d+)$/`, such as `"-1"` or `"-3.5"`), treat it as a positional argument (so numeric positional args accept negative numbers).
       - Otherwise, throw `CLIError.unknownOption`.
   - **Pending option value (`pendingOption` is set):**
     - If the token stream ends while `pendingOption` is still set, throw `CLIError.missingOptionValue`.
     - If the next token is `"--"`, throw `CLIError.missingOptionValue`.
     - If the next token starts with `"-"` and has length > 1, is NOT a negative numeric literal, OR is a registered option/alias on the current CLI, throw `CLIError.missingOptionValue` (prevents typos like `--format --verbose` from silently turning `--verbose` into the value of `--format`).
     - Otherwise (normal value, lone `"-"`, or unregistered negative numeric literal such as `--age -1`), assign that single token as the raw value of `pendingOption` and clear `pendingOption`.
   - **Repeated options:** If the same option (or its aliases) appears multiple times, the last occurrence wins (matching v0.4.0).
   - **Subcommand matching:** When a non-option positional token arrives AND `!isAfterDoubleDash`, `rawPositionalArgs.length === 0`, `Object.keys(rawOptionArgs).length === 0`, and `cli.state.commands[token]` exists:
     - Merge the parent's `globalOptionArgs` into the matched subcommand CLI via `addGlobalOption` (inheriting aliases and definitions).
     - Recursively tokenize the remaining tokens against that subcommand CLI, carrying forward any `rawGlobalOptionArgs` already collected at parent levels (which the subcommand may override if repeated).
   - **Otherwise:** Append the token to `rawPositionalArgs`.

2. **After `--`:**
   - Every token is appended directly to `rawPositionalArgs`. Neither options nor subcommands are matched after `--`.

### Intentional Behavior Change From v0.4.0

In v0.4.0, options greedily joined all following non-flag tokens with spaces (e.g., `["--tags", "one", "two", "three"]` produced `tags: "one two three"`). That greedy behavior is fundamentally incompatible with interleaved positional arguments (e.g., `--format json src/a.ts src/b.ts`). Under this design:

- Each value-taking option consumes exactly **one** value token (matching POSIX, Node `util.parseArgs`, Commander, and Yargs). Multi-word option values are passed as a single quoted shell token (e.g., `--tags "one two three"`).
- Extra non-flag tokens after a value-taking option become positional arguments (throwing `CLIError.tooManyPositionalArgs` if the CLI declares no positional arguments to accept them).
- Unknown option flags before `--` now throw `CLIError.unknownOption` rather than being silently ignored.

### Non-Goals

- **Short-flag bundling (e.g., `-vf`):** Intentionally not added because `CLIOptionAlias` permits multi-character single-dash aliases (`-${string}`).

## 6. Allocation, Parsing, Validation, Defaults, and `askIfEmpty`

### Positional Allocation

Given `positionalArgs` of length `k` and `rawPositionalArgs`:

- **No variadic positional arg:**
  - If `rawPositionalArgs.length > k`, throw `CLIError.tooManyPositionalArgs`.
  - Each `positionalArgs[idx]` receives `rawPositionalArgs[idx]`.
- **Trailing variadic positional arg at index `k - 1`:**
  - Never throws `CLIError.tooManyPositionalArgs`.
  - Leading fixed positional args `0 .. k - 2` receive `rawPositionalArgs[idx]` as scalars.
  - The variadic arg at `k - 1` receives `rawPositionalArgs.slice(k - 1)`.

### Per-Value Parsing & Validation (`parseCLIParamValue`)

Used for scalar positional args, each element of a variadic positional arg, local options, and global options:

1. **Parsing raw string input:**
   - If `paramConfig.parser` is provided, call `paramConfig.parser(inputValue)`.
   - Otherwise, use the default parser by `paramConfig.type`:
     - `"boolean"`: `inputValue === "false" ? false : true` (preserves v0.4.0 contract).
     - `"number"`: `Number.parseInt(inputValue, 10)`. If `Number.isNaN(parsed)`, throw `CLIError.invalidCLIParamValue`.
     - `"string"`: `inputValue`.
2. **Choices validation:**
   - If `paramConfig.choices` is defined and non-empty and does not include `parsedValue`, throw `CLIError.invalidCLIParamValue` listing the allowed choices.
3. **Custom validator:**
   - If `paramConfig.validator` is defined, invoke it with `parsedValue`. If the return value is not `true`, throw `CLIError.invalidCLIParamValue` using the returned string (when string) or the default message.
4. **Default value validation:**
   - When no input is provided and a `defaultValue` is applied, run choices and validator checks on the default value (or on every element of a variadic `defaultValue`).

### Variadic Empty-Input Semantics

When a variadic positional arg receives 0 raw tokens:

1. If `argConfig.askIfEmpty` is configured, prompt once via `requestTerminalInput`:
   - If the user enters a non-empty value, treat it as a single-element raw input `[response]` and run element parsing/validation.
   - If the user submits empty input on an arg with `defaultValue`, return a validated shallow copy `[...argConfig.defaultValue]` (even when `required: true`, matching existing scalar `askIfEmpty` + `required` + `defaultValue` behavior).
   - If the user submits empty input on an optional arg with no `defaultValue`, return `[]`.
2. If `argConfig.askIfEmpty` is not configured:
   - If `argConfig.required` is `true`, throw `CLIError.missingRequiredPositionalArg` (ignoring `defaultValue`, matching v0.4.0 required-param semantics).
   - If `argConfig.required` is `false`:
     - If `argConfig.defaultValue !== undefined`, validate every element and return a fresh mutable copy `[...validatedDefaults]`.
     - Otherwise, return a fresh empty array `[]`.

## 7. Help Text Representation

In `generateHelpText`:

- Non-variadic positional args, options, global options, and commands retain their exact existing output format.
- A variadic positional arg renders with a trailing `...` on its name and `[]` on its type:
  - Optional: `  paths... (string[]) optional - Paths to inspect`
  - Optional with default: `  paths... (string[]) optional - Paths to inspect [default: ["."]]`
  - Required: `  files... (string[]) required - Files to process`

## 8. Error Handling (`CLIError`)

- Add `code: "missing_option_value"` and `CLIError.missingOptionValue({ cliName, optionName, message? })`.
- Expose `readonly code: CLIErrorCode` on `CLIError` instances so callers and tests can branch on structured error codes without parsing error strings.

## 9. Module Architecture

```text
src/
  CLIError.ts                                      # Add missing_option_value + readonly code
  index.ts                                         # Export CLIError + new positional param types
  AcclimateCLI/
    CLIParam.types.ts                              # Extracted param + variadic param types
    AcclimateCLI.types.ts                          # Builder/state types + updated ValueOfParam
    AcclimateCLI.ts                                # Builder-time variadic-must-be-last check
    generateHelpText/
      generateHelpText.ts                          # Variadic help format + fix pre-existing lint issues
      generateHelpText.test.ts                     # Variadic help tests
    runCLI/
      tokenizeCLIInput/
        tokenizeCLIInput.ts                        # Pure functional tokenizer + subcommand descent
        tokenizeCLIInput.test.ts                   # Focused tokenizer unit tests
      parseCLIParamValue/
        parseCLIParamValue.ts                      # Scalar parser + choices + validator
        parseCLIParamValue.test.ts                 # Focused parser/validator unit tests
      runCLI.ts                                    # Orchestrates tokenization, allocation, prompts, action
      runCLI.test.ts                               # End-to-end runCLI + variadic + interleaving tests
docs/
  argument-parsing.md                              # Architecture and behavior docs
README.md                                          # Updated API and parsing docs
```

Every source file stays well under the 400-line threshold, uses pure functional patterns (`reduce`, `map`, `filter`) for synchronous collection work, and keeps every function <= 45 lines.

## 10. Verification Plan

- Red/green TDD for every unit (`AcclimateCLI`, `CLIError`, `parseCLIParamValue`, `tokenizeCLIInput`, `runCLI`, `generateHelpText`) including compile-time type assertions via Vitest `expectTypeOf` / TypeScript compilation.
- Full verification before completion: `npm test`, `npm run type`, `npm run lint`, and `npm run build`.
- Post-implementation `/avandar-code-review` and `/diff-review` walkthrough committed under `docs/code-walkthroughs/`.
