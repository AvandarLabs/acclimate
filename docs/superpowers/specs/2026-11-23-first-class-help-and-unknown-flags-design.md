# First-Class Help Handling & Unknown-Flag Error Reporting Design

**Date:** 2026-11-23
**Package:** `@avandar/acclimate`
**Branch:** `jpsyx/feat/first-class-help-and-unknown-flags`

## 1. Goal

Provide first-class `-h` / `--help` handling and clear nonzero failure reporting for unknown flags and CLI usage errors in `@avandar/acclimate` without requiring downstream CLIs (such as `ava-cli`) to maintain separate help pre-parsers:

- `-h` and `--help` work at root and every nested subcommand level, taking precedence over required argument/option validation, interactive `askIfEmpty` prompts, other flag errors, and command actions (zero side effects).
- Help output prints complete, clear usage (purpose, synopsis, subcommands, positional arguments including variadic ones, options including built-in `--help, -h`, global options including inherited parent globals, choices, defaults, and examples when declared) to `stdout` and resolves cleanly with exit code `0`.
- Unknown flags and CLI input errors fail with a clear error message, an indented recovery hint (`Run <cmd> --help...`), and the matched command's usage on `stderr`, leaving `stdout` empty and exiting nonzero (`process.exitCode = 1`) without printing a raw stack trace or running any command action.
- Optional command-level `.usage(...)` and `.addExample(...)` builder methods allow authors to customize usage synopses and attach worked examples while keeping all existing Acclimate CLI declarations 100% backwards-compatible.

## 2. Design Approaches Considered

### Approach A: Tokenizer-Integrated Help + Enriched `CLIError` + `executeCLI` Boundary (Recommended)

1. Detect built-in `-h` / `--help` directly inside `tokenizeCLIInput` while descending subcommands and tracking `commandPath`. Defer tokenization errors (`unknown_option`, `missing_option_value`) until the end of scanning so a later `--help` before `--` still takes precedence.
2. Enrich `CLIError` instances thrown during tokenization and `runCLI` argument parsing with optional `commandPath`, `hint`, and `usage` fields so `runCLI` keeps its throwing contract for programmatic callers and existing tests.
3. Introduce pure `formatCLIError` and stream-injectable `executeCLI` helpers, and wire `Acclimate.run(cli)` through `executeCLI` so real CLI executions write help to `stdout` (exit `0`), write formatted errors + recovery hints + usage to `stderr` (exit `1`), and never clobber a user action's own `process.exitCode`.

- **Pros:** Single source of truth for command resolution, global-option inheritance, and `--` handling; 100% backwards-compatible with all existing `runCLI` tests and `Acclimate.run(cli)` (`void` return avoids `@typescript-eslint/no-floating-promises` regressions in callers); fully deterministic and unit-testable via injectable streams without mutating `process` globals.
- **Cons:** Adds optional context properties (`cliName`, `commandPath`, `hint`, `usage`) to `CLIError`.

### Approach B: Pre-Scan `argv` Before `tokenizeCLIInput`

Scan `argv` for `-h` / `--help` in a separate pass before calling `tokenizeCLIInput`.

- **Pros:** Minimal edits inside `tokenizeCLIInput`.
- **Cons:** Duplicates subcommand matching, global-option arity scanning (`--config coverage coverage --help`), `--` end-of-options handling, and user-registered `-h` collision checks. Divergent tokenizers inevitably drift.

### Approach C: Make `runCLI` Swallow `CLIError` and Write Directly to `stderr`

Change `runCLI` to catch its own `CLIError`, write to `stderr`, and set `process.exitCode = 1`.

- **Pros:** One fewer wrapper function.
- **Cons:** Breaks existing `runCLI` unit tests and programmatic callers that expect `runCLI` to reject with `CLIError`; couples core parsing to `process.exitCode`.

### Decision

Adopt **Approach A**. Integrating help detection into `tokenizeCLIInput`, keeping `runCLI` throwing enriched `CLIError` instances, and handling error rendering plus exit codes in `executeCLI` / `Acclimate.run` keeps one authoritative parser, respects `docs/rules/node.md` and `docs/rules/cli-ux.md`, and preserves full backwards compatibility.

## 3. Public API Additions

All additions are backwards-compatible and leave `IAcclimateCLI`'s four generic type parameters unchanged (`TPositionalParams`, `TOptionParams`, `TGlobalOptionParams`, `TCommands`).

### Builder Methods on `IAcclimateCLI`

```ts
/** Example invocation displayed in a command's generated help text. */
export type CLIExample =
  | string
  | {
      /** Example shell command line. */
      command: string;

      /** Optional explanation of what the example demonstrates. */
      description?: string;
    };
```

Added to `CLIState` and `IAcclimateCLI`:

- `cli.usage(usage: string)`: Sets a custom usage synopsis line (overrides the auto-generated synopsis in `generateHelpText`). Stored in `state.usage?: string`.
- `cli.addExample(example: CLIExample)`: Appends an example entry to `state.examples: readonly CLIExample[]` (default `[]`).
- `cli.action(...)`: Widens the callback return type from `void` to `void | Promise<void>` so async actions are awaited by `runCLI` while remaining 100% compatible with synchronous actions.

### Help & Execution Exports from `src/index.ts`

In addition to existing exports (`Acclimate`, `CLIError`, `CLIErrorCode`, and builder/param types):

- `export type { CLIExample }`: Public type for `.addExample(...)`.
- `export type { OutputStream }`: Minimal `{ write: (chunk: string) => unknown }` stream contract used by `runCLI` and `executeCLI`.
- `export { generateHelpText }`: Generates formatted help text for any CLI, accepting an optional second options object `{ commandPath?: readonly string[] }`.
- `export { executeCLI }`: Async execution boundary (`Promise<number>` exit code) with injectable `{ cli, input, stdout?, stderr?, onExitCode? }` for deterministic embedding and testing.

### `CLIError` Properties

`CLIError` exposes:

- `readonly code: CLIErrorCode` (existing)
- `readonly cliName: string`
- `readonly commandPath: string[] | undefined`
- `readonly hint: string | undefined`
- `readonly usage: string | undefined`

`CLIError.unknownOption` uses the clear default message `Unknown option "${options.optionName}"`.

`error.withHelpContext({ commandPath, hint, usage })` returns a new `CLIError`
preserving `code` and the original unprefixed detail message, updating
`cliName` to `commandPath.join(" ")`, and attaching `commandPath`, `hint`, and
`usage` without double-prefixing the formatted message.

## 4. `-h` / `--help` Recognition & Precedence

### Built-In Help Flag Rules

For any active command `cli` (including inherited parent global options):

1. `--help` is treated as the built-in help flag unless the CLI explicitly registered `--help` in `optionArgs`, `globalOptionArgs`, or `aliases`.
2. `-h` is treated as the built-in help alias when built-in `--help` is active AND the CLI did not explicitly register `-h` in `aliases` (for example, a CLI using `-h` as an alias for `--host` keeps `-h` mapped to `--host` while `--help` still prints help).
3. Only exact tokens `"-h"` and `"--help"` (no inline `=value`) trigger built-in help. Tokens such as `--format=--help` supply `"--help"` as the value of `--format`.
4. After the `--` end-of-options separator, neither `-h` nor `--help` triggers help; both are passed verbatim as positional arguments.

### Precedence & Scanning Semantics in `tokenizeCLIInput`

`TokenizedCLIInput` gains:

- `commandPath: string[]` (initialized to `[cli.getName()]`; when descending into a subcommand via `token`, appends `token` so the path matches the exact user invocation, such as `["avandar-lint", "coverage"]`).
- `isHelpRequested: boolean`.

`TokenScanState` tracks `isHelpRequested: boolean` and `scanError: CLIError | undefined`:

- When a built-in help flag appears before `--` (either in normal scanning state or immediately after a value-taking option in `pendingOption` state, such as `coverage --format --help`):
  - Sets `isHelpRequested = true`, clears `pendingOption`, and short-circuits remaining tokens.
- When an unrecognized flag or missing option value occurs before `--`:
  - Records the first `CLIError` in `scanError` (with `commandPath`, `hint`, and `usage` for the active command) and continues scanning remaining tokens on that command level.
  - Prevents subcommand descent once `scanError` is recorded so `root --unknown sub` reports the unknown option on `root` rather than silently descending into `sub`.
- At the end of `tokenizeCLIInput`:
  - If `finalState.delegatedResult` is set, returns it.
  - If `finalState.isHelpRequested` is `true`, returns `{ targetCLI: cli, commandPath, isHelpRequested: true, rawPositionalArgs, rawOptionArgs, rawGlobalOptionArgs }` regardless of `scanError` or `pendingOption`.
  - Otherwise, if `finalState.scanError` is set, throws `finalState.scanError`.
  - Otherwise, if `finalState.pendingOption` is set, throws `CLIError.missingOptionValue` with help context for `(cli, commandPath)`.

### Execution Order in `runCLI`

1. Call `tokenizeCLIInput({ cli, input })`.
2. If `tokenized.isHelpRequested` is `true`:
   - Write `${generateHelpText(targetCLI, { commandPath })}\n` to `stdout` (defaulting to `process.stdout`).
   - Return immediately. Required positional checks, required option checks, value parsers/validators, `askIfEmpty` prompts, and `targetCLI.state.action` are never executed.
3. Otherwise, parse positional args, local options, and global options. If any step throws a `CLIError` lacking `hint`/`usage`, attach `(targetCLI, commandPath)` help context and rethrow.
4. If `targetState.action` is defined, `await targetState.action(parsedArgs)`.
5. Otherwise (no action configured), write `${generateHelpText(targetCLI, { commandPath })}\n` to `stdout`.

## 5. Help Text Layout (`generateHelpText`)

At level 1 (the command being documented), `generateHelpText(cli, { commandPath })` renders:

1. **Header:** Full command path (`commandPath.join(" ")`, defaulting to `cli.getName()`) in `bright_cyan`, followed by indented `description` in `gray` if declared.
2. **Usage:** `Usage` section header in `bright_yellow`, followed by either `state.usage` (if explicitly declared) or an auto-generated synopsis:
   - Command path + subcommand token (`<command>` when subcommands exist with no action and no positional args, or `[command]` when subcommands exist alongside an action/positionals) + positional argument tokens in order (`<name>`, `[name]`, `<name...>`, `[name...]`) + `[options]` (whenever any local option, global option, or built-in help flag is present).
3. **Positional Arguments** (omitted if empty): Each entry shows `name` (or `name...` when variadic), `(type)` (or `(type[])`), `required` / `optional`, `- description`, `[choices: a | b | c]` when `choices` is non-empty, and `[default: ...]` when `defaultValue !== undefined`.
4. **Options** (omitted if empty): Local options formatted identically (with aliases), plus the built-in help option (`--help, -h`, or `--help` if `-h` is taken) at level 1 whenever `--help` is not already explicitly declared by the user.
5. **Global Options** (omitted if empty): Global options (including inherited parent global options on resolved subcommands).
6. **Examples** (omitted if empty, level 1 only): Each string renders as `  <command>`; each `{ command, description }` renders as `  <command> - <description>`.
7. **Commands** (omitted if empty): Alphabetically sorted subcommands expanded at level 2 (level 2 omits redundant built-in `--help` and `Usage` sections to keep root help concise, and renders nested level-3 subcommands as bulleted summaries).

## 6. Unknown Flags & Error Rendering (`formatCLIError` and `executeCLI`)

### Recovery Hint Format

For any CLI invocation error on `commandPath`:

```text
Run <commandPath> --help to see available options and usage.
```

(When a command explicitly overrides `--help`, the hint falls back cleanly without breaking; for standard commands it always uses `<commandPath> --help`.)

### Formatted `stderr` Output (`formatCLIError`)

```text
|red|<error.message>|reset|
  |yellow|⚠️ <error.hint>|reset|

<error.usage>
```

When `error.hint` or `error.usage` is absent (for example a builder-time config error), only the present parts are emitted.

### `executeCLI` and `Acclimate.run`

- `executeCLI({ cli, input, stdout?, stderr?, onExitCode? })`:
  - Runs `await runCLI({ cli, input, stdout })`.
  - On normal resolution (help printed or action succeeded): returns `0` without overwriting `process.exitCode` (preserving any exit code explicitly set by a command's `.action()`).
  - On caught `CLIError`: writes `${formatCLIError(error)}\n` to `stderr` (default `process.stderr`), invokes `onExitCode?.(1)`, and returns `1`. Never writes error diagnostics or usage to `stdout`, and never prints a raw internal stack trace.
  - On caught unexpected non-`CLIError`: writes `${error.stack ?? error.message}\n` (or `String(error)`) to `stderr`, invokes `onExitCode?.(1)`, and returns `1`.
- `Acclimate.run(cli)` keeps its `void` signature and delegates to `executeCLI` with `input: process.argv.slice(2)`, `stdout: process.stdout`, `stderr: process.stderr`, and `onExitCode: (exitCode) => { process.exitCode = exitCode; }`. It never calls `process.exit()`.

## 7. Module Architecture

```text
src/
  CLIError.ts                                      # Add cliName, commandPath, hint, usage, withHelpContext
  Acclimate.ts                                     # Delegate Acclimate.run to executeCLI
  index.ts                                         # Export CLIExample, OutputStream, generateHelpText, executeCLI
  AcclimateCLI/
    CLIParam.types.ts                              # Add CLIExample and OutputStream types
    AcclimateCLI.types.ts                          # Add usage/examples to CLIState & IAcclimateCLI; async action
    AcclimateCLI.ts                                # Implement .usage() and .addExample()
    createCLI/
      defaultCLIState.ts                           # Seed usage: undefined, examples: []
      createCLI.test.ts                            # Builder tests for usage, addExample, CLIError help context
    generateHelpText/
      generateHelpText.ts                          # Synopsis, choices, examples, built-in --help/-h, commandPath
      generateHelpText.test.ts                     # Updated + new tests for complete help output
    formatCLIError/
      formatCLIError.ts                            # Pure stderr formatter (error + yellow warning hint + usage)
      formatCLIError.test.ts                       # Focused unit tests
    executeCLI/
      executeCLI.ts                                # Top-level boundary mapping CLIError -> stderr + exitCode 1
      executeCLI.test.ts                           # Unit + real subprocess tests (stdout/stderr/exitCode)
    runCLI/
      tokenizeCLIInput/
        tokenizeCLIInput.ts                        # commandPath, built-in -h/--help precedence, deferred scanError
        tokenizeCLIInput.test.ts                   # Help precedence, collision, --, and unknown-flag tests
      runCLI.ts                                    # Short-circuit help to stdout, attach CLIError help context
      __tests__/
        runCLI.help.test.ts                        # End-to-end -h/--help zero-side-effect tests
        runCLI.errors.test.ts                      # Enriched CLIError context on unknown flags & parse failures
docs/
  argument-parsing.md                              # Document help precedence, metadata, stderr errors & exit codes
README.md                                          # Document -h/--help, .usage(), .addExample(), unknown flags
```

## 8. Verification Plan

- Red/green TDD for every unit (`CLIError`, `AcclimateCLI`, `generateHelpText`, `formatCLIError`, `tokenizeCLIInput`, `runCLI`, `executeCLI`), including subprocess verification of real `Acclimate.run(cli)` exit codes (`0` for `-h`/`--help`, `1` for unknown flags) and strict `stdout`/`stderr` separation.
- Full verification gate before finishing: `npm run type`, `npm run lint`, `npm test`, and `npm run build`.
- Post-implementation `/avandar-code-review` across the branch, fixes committed, followed by `/diff-review` walkthrough committed under `docs/code-walkthroughs/`.
