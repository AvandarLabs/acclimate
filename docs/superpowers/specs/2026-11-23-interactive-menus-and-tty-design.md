# Interactive Menus, `/dev/tty` Prompt IO, Unattended Fallback, and Stream Separation Design

**Date:** 2026-11-23
**Package:** `@avandar/acclimate`
**Branch:** `jpsyx/feat/interactive-menus-and-tty`

## 1. Goal

Make `@avandar/acclimate` safe and ergonomic for both humans at a terminal and
non-interactive automation (pipes, CI jobs, and coding agents):

- **Controlling terminal (`/dev/tty`) prompt and menu IO:** Interactive prompts
  and menus read input from and render UI to the controlling terminal
  (`/dev/tty`, falling back to `stdin` + `stderr` only when both are TTYs),
  leaving piped `stdin` unconsumed and machine-consumable `stdout` completely
  clean. Explicit CLI values never open `/dev/tty`.
- **Interactive choice menus:** Provide arrow (`Up`/`Down`) and Vim (`j`/`k`)
  wrapping navigation, `g`/`G` jump to first/last (plus `Home`/`End` and `1`-`9`
  shortcuts), bold-green highlighted selection with a textual `❯` cursor,
  `Enter` confirmation, and clean `Ctrl-C`/`EOF` cancellation that restores raw
  terminal mode and cursor visibility before exiting nonzero without running
  command actions. Use choice menus automatically for `choices` parameters,
  `boolean` parameters, bare actionless multi-command CLIs, and the public
  `Acclimate.requestChoice` / `requestChoiceMenu` helper.
- **Interactive vs unattended behavior:** When no controlling terminal is
  attached, `CI` is enabled, `--no-prompt` is passed, or `interactive: false` is
  configured, Acclimate never prompts or hangs: missing required parameters
  (including those with `askIfEmpty`) fail promptly with an actionable
  `CLIError` naming the flag/argument and example invocation, while optional
  parameters fall back to `defaultValue` (or `[]` / `undefined`).
- **Strict stream separation:** Machine data goes strictly to `stdout` (via
  command actions, `Acclimate.writeData`, and `Acclimate.writeJson`; plus
  explicit `-h`/`--help` per CLI conventions). Conversational diagnostics and
  `Acclimate.log` write to `stderr` (respecting TTY, `NO_COLOR`, and
  `TERM=dumb`). Errors, recovery hints, and usage-on-error stay on `stderr`, and
  interactive prompts stay on `/dev/tty` (or `stderr`).

## 2. Design Approaches Considered

### Approach A: Injectable `TerminalSession` + Pure Menu Engine + Stream-Aware Execution Boundary (Recommended)

1. Introduce a `terminalSession` subsystem (`isColorEnabledForStream` and
   `openTerminalSession`) that centralizes TTY detection, `CI` / `NO_COLOR` /
   `TERM=dumb` handling, `/dev/tty` opening via promisified `node:fs` +
   `node:tty` streams, and safe fallback/cleanup.
2. Introduce a `requestChoiceMenu` subsystem split into a pure key/navigation
   module (`MenuNavigation`), a pure ANSI/plain renderer (`renderChoiceMenu`),
   and a thin raw-mode / line-fallback orchestrator (`requestChoiceMenu`).
3. Update `requestTerminalInput` to accept an injectable `TerminalSession`,
   delegate `choices` and `boolean` prompts to `requestChoiceMenu`, write all
   prompt text and validation feedback to `session.output` (never `stdout`),
   handle `Ctrl-C`/`EOF` via `CLIError.promptCancelled`, and handle unattended
   fallback cleanly.
4. Integrate lazy single-session prompting, built-in `--no-prompt`, unattended
   error hints, and bare multi-command action menus into `tokenizeCLIInput`,
   `runCLI` (with extracted `promptCLIParam`), `executeCLI`, and `Acclimate`.

- **Pros:** Keeps process globals out of core modules per `docs/rules/node.md`;
  every navigation transition, rendering rule, TTY fallback, cancellation, and
  stream-separation invariant is deterministically unit-testable without real
  PTY flakiness; 100% backwards-compatible with PR 1 and PR 2 APIs and test
  contracts; zero new runtime dependencies.
- **Cons:** Adds new internal modules (`terminalSession`, `requestChoiceMenu`,
  `promptCLIParam`) and requires updating legacy `askIfEmpty` tests that
  previously asserted `process.stdout.write` without a TTY.

### Approach B: Add a Third-Party Prompt Library (e.g. `@clack/prompts` or `inquirer`)

Wrap an external prompt library inside `requestTerminalInput`.

- **Pros:** Less low-level ANSI and key-parsing code.
- **Cons:** Violates `AGENTS.md` and `docs/rules/node.md` ("Runtime dependencies
  stay minimal", "Prefer what Node ships over adding third-party packages");
  most prompt libraries do not natively support `j`/`k` wrapping + `g`/`G` +
  exact bold-green `❯` cursor styling + automatic `/dev/tty` isolation when
  `stdin` and `stdout` are both piped.

### Approach C: Keep `process.stdin` and Redirect Output Only to `process.stderr`

Swap `stdout` to `stderr` in `readline/promises` without opening `/dev/tty`.

- **Pros:** Smaller diff.
- **Cons:** Still consumes piped `stdin` (`echo data | tool | jq`) as menu
  answers and fails to isolate interactive input from data pipelines.

### Decision

Adopt **Approach A**. Pure navigation and rendering modules paired with an
injectable `TerminalSession` give exact Avandar CLI UX compliance, reliable
`/dev/tty` isolation, zero new runtime dependencies, and deterministic tests.

## 3. Controlling Terminal (`terminalSession`) & Color Rules

### Types (`src/terminalSession/terminalSession.types.ts`)

```ts
export type TerminalInputStream = NodeJS.ReadableStream & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  pause?: () => void;
  resume?: () => void;
};

export type TerminalOutputStream = {
  write: (chunk: string) => unknown;
  isTTY?: boolean;
};

export type TerminalSession = {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  isColorEnabled: boolean;
  isRawModeSupported: boolean;
  close: () => Promise<void>;
};

export type TerminalSessionOptions = {
  session?: TerminalSession;
  interactive?: boolean;
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  openTty?: () => Promise<TerminalSession | undefined>;
};
```

### Color Detection (`isColorEnabledForStream`)

Color is enabled on a stream when ALL of the following hold:

1. `stream.isTTY === true`
2. `env.NO_COLOR` is `undefined` or `""` (any nonempty `NO_COLOR` disables color)
3. `env.TERM !== "dumb"`

`generateTerminalMessage(message, params?, options?)` adds `"bold": "\x1b[1m"`
to `COLOR_CODES` and accepts an optional third argument
`options?: { color?: boolean }` (default `{ color: true }` for full backwards
compatibility). When `color` is `false`, all `|<name>|` tokens are stripped
without emitting ANSI escapes or appending a reset sequence.

### Interactivity & `/dev/tty` Resolution (`openTerminalSession`)

1. If `options.interactive === false`: return `undefined` immediately without
   touching `/dev/tty` or any stream.
2. If `options.session` is provided: return a wrapper over `options.session`
   whose `close()` is a no-op (caller retains lifecycle ownership).
3. If `options.interactive !== true`:
   - If `env.CI === "true"` or `env.CI === "1"`: return `undefined`.
   - Compute `hasAttachedTty = Boolean(stdin.isTTY || stdout.isTTY || stderr.isTTY)`.
   - If `!hasAttachedTty`: return `undefined`. This ensures scripts, agents,
     `execFile`, and fully redirected invocations (`tool < /dev/null > out 2> err`)
     never hijack a parent shell's `/dev/tty` or hang.
   - Note: piping `stdin`, `stdout`, or both in a human terminal (`cat in | tool | jq`)
     keeps `stderr.isTTY === true`, so `hasAttachedTty` remains `true`.
4. When eligible (`hasAttachedTty || options.interactive === true`):
   - Attempt to open `/dev/tty` via `openTty` (default on POSIX platforms opens
     separate `O_RDONLY` and `O_WRONLY` descriptors using promisified `node:fs`
     `open`, wraps them in `tty.ReadStream` and `tty.WriteStream`, sets
     `isRawModeSupported = env.TERM !== "dumb"`, computes `isColorEnabled`, and
     defines `close()` to restore `setRawMode(false)` if raw, `pause()`, and
     `destroy()` both streams cleanly without double-closing fds).
   - If `/dev/tty` is unavailable (for example `ENXIO`/`ENOENT` or Windows),
     fall back to `{ input: stdin, output: stderr }` **only if**
     `Boolean(stdin.isTTY && stderr.isTTY)`. Never fall back to non-TTY `stdin`
     (which would consume piped data) or to `stdout` (which would pollute data
     output). The fallback `close()` restores raw mode and pauses `stdin`
     without destroying process streams.
   - If neither `/dev/tty` nor `(stdin.isTTY && stderr.isTTY)` is available:
     return `undefined`.

## 4. Interactive Choice Menu (`requestChoiceMenu`)

### Public Types (`src/requestChoiceMenu/requestChoiceMenu.types.ts`)

```ts
export type ChoiceMenuItem<TValue extends string = string> = {
  value: TValue;
  label?: string;
  description?: string;
};

export type ChoiceMenuOptions<TValue extends string = string> = {
  message: string;
  choices: ReadonlyArray<ChoiceMenuItem<TValue>>;
  defaultValue?: TValue;
  hint?: string;
  terminal?: TerminalSession;
  interactive?: boolean;
  cliName?: string;
};
```

### Key Navigation (`MenuNavigation`)

Pure chunk parser and state transition helper supporting buffered multi-key
chunks and split ANSI escape sequences (`\x1b`, `\x1b[`, `\x1bO`):

| Key / Sequence                            | Action                                           |
| ----------------------------------------- | ------------------------------------------------ |
| Up arrow (`\x1b[A`, `\x1bOA`), `k`        | Move up, wrapping from `0` to `numChoices - 1`   |
| Down arrow (`\x1b[B`, `\x1bOB`), `j`      | Move down, wrapping from `numChoices - 1` to `0` |
| `g`, Home (`\x1b[H`, `\x1bOH`, `\x1b[1~`) | Jump to index `0`                                |
| `G`, End (`\x1b[F`, `\x1bOF`, `\x1b[4~`)  | Jump to index `numChoices - 1`                   |
| Digits `1`-`9`                            | Move highlight to `digit - 1` when within bounds |
| Enter (`\r`, `\n`)                        | Confirm currently highlighted item               |
| `Ctrl-C` (`\x03`)                         | Cancel (`reason: "ctrl_c"`)                      |
| `Ctrl-D` (`\x04`) or input `end`/`close`  | Cancel (`reason: "eof"`)                         |
| Any other key                             | Ignored (never corrupts or confirms selection)   |

### Rendering (`renderChoiceMenu`)

- Header line: `? <message>` (bright cyan when color enabled) + muted hint
  `(↑/↓ or j/k to move, g/G first/last, Enter to select)`.
- Selected item: **bold green** (`|bold||bright_green|`) with textual cursor `❯`
  (in plain mode, `❯ <label>` without ANSI codes), optional description, and
  `(default)` badge when matching `defaultValue`.
- Unselected items: two-space indent `  <label>`, optional muted description,
  and `(default)` badge when matching `defaultValue`.
- Raw-mode TTY updates hide the cursor (`\x1b[?25l`), move up `lineCount` lines
  (`\x1b[<n>A`) and clear below (`\x1b[0J`) on re-render, and on confirm erase
  the menu, show the cursor (`\x1b[?25h`), and write one summary line
  `✔ <message>: <label>\n` to `session.output`.
- Non-raw fallback (when `session.isRawModeSupported === false`, such as
  `TERM=dumb`): renders a plain numbered list (`1. ...`, `2. ...`) with no ANSI
  cursor-control escapes and reads a line via `readline/promises`, accepting
  item number, exact value/label, or empty Enter for `defaultValue`, rejecting
  invalid text and re-prompting without silently accepting a previous selection.

### Cleanup & Cancellation Guarantees

In a single idempotent cleanup executed on confirm, cancel, error, or `SIGINT`:

1. Remove all stream listeners (`data`, `end`, `close`, `error`) and any `SIGINT`
   listener.
2. Restore `input.setRawMode(previousRawMode)` when `setRawMode` exists.
3. Pause `input` if resumed.
4. Restore cursor visibility (`\x1b[?25h`) when hidden.
5. Close the session if opened locally by `requestChoiceMenu`.

Cancellation throws `CLIError.promptCancelled({ cliName })` (`code:
"prompt_cancelled"`). Calling `requestChoiceMenu` with empty `choices` throws an
`Error`. Calling `requestChoiceMenu` when no interactive session is available
throws `CLIError.interactiveInputUnavailable(...)`.

## 5. `requestTerminalInput`, Built-In `--no-prompt`, and `runCLI` Integration

### `CLIError` Additions (`src/CLIError.ts`)

Add two `CLIErrorCode` members and static factories:

- `code: "prompt_cancelled"` (`CLIError.promptCancelled`): thrown when a user
  aborts an interactive prompt or choice menu with `Ctrl-C` or `EOF`.
- `code: "interactive_input_unavailable"` (`CLIError.interactiveInputUnavailable`):
  thrown when a direct interactive prompt (`Acclimate.requestInput` with
  `required: true` and no `defaultValue`, or `Acclimate.requestChoice`) is
  invoked without a controlling terminal or with `interactive: false`.

Extend `CLIError.missingRequiredOption` and `CLIError.missingRequiredPositionalArg`
to accept an optional `hint?: string`, and update `attachCLIErrorHelpContext` so
it preserves a pre-populated `error.hint` (falling back to `Run <cmd> --help to
see available options and usage.` when absent) and omits the full usage dump for
`prompt_cancelled`.

### `requestTerminalInput` Updates (`src/requestTerminalInput/requestTerminalInput.ts`)

Backwards-compatible extension of `options`:

- `responseOptions` gains optional `choices?: readonly CLIParamScalarValue[]`
  and `validate?: (rawValue: string) => true | string`.
- Top-level `options` gains optional `terminal?: TerminalSession`,
  `interactive?: boolean`, `cliName?: string`.
- Behavior:
  1. Opens or reuses a `TerminalSession` via `openTerminalSession`.
  2. When unattended (no session):
     - If `defaultValue !== undefined` and `!required`: returns stringified
       `defaultValue`.
     - If `!required`: returns `undefined`.
     - If `required`: throws `CLIError.interactiveInputUnavailable(...)`
       instead of hanging.
  3. When interactive: - If `choices` is non-empty: delegates to `requestChoiceMenu` (appending an
     explicit `(skip)` item returning `undefined` when `!required &&
defaultValue === undefined`). - If `type === "boolean"` and `session.isRawModeSupported`: delegates to
     `requestChoiceMenu` with `Yes` (`"true"`) / `No` (`"false"`). - Otherwise runs `readline/promises` bound strictly to
     `{ input: session.input, output: session.output }` (never `stdout`!),
     validating required, boolean `(y/n)` in non-raw mode, integer numbers for
     `type === "number"`, and custom `validate`, writing error hints to
     `session.output` and converting `SIGINT`/`EOF` to
     `CLIError.promptCancelled`.

### Built-In `--no-prompt` in `tokenizeCLIInput`

`TokenizedCLIInput` gains `isNoPromptRequested: boolean`:

- If a CLI explicitly declares `--no-prompt` as a local or global option, it
  parses normally into `rawOptionArgs` / `rawGlobalOptionArgs` (so `action(args)`
  still receives `noPrompt`) AND sets `isNoPromptRequested = rawValue !== "false"`.
- If a CLI does NOT declare `--no-prompt`, `--no-prompt` (and
  `--no-prompt=true` / `--no-prompt=false`) is recognized before `--` as a
  built-in unattended flag without throwing `unknown_option` and without adding
  an undeclared `noPrompt` key to `action(args)`.
- Propagates across parent-to-subcommand delegation; passes through verbatim as
  a positional argument after `--`.

### `runCLI` Interactive Lifecycle, Menus, and Unattended Fallback

`runCLI` accepts optional injectable terminal/environment overrides:
`stderr?: TerminalOutputStream`, `stdin?: TerminalInputStream`,
`env?: Readonly<Record<string, string | undefined>>`,
`terminal?: TerminalSession`, `interactive?: boolean`, and
`openTty?: () => Promise<TerminalSession | undefined>`.

1. **Lazy single-session lifecycle:** `runCLI` creates a lazy session getter
   configured with `interactive: effectiveInteractive` (`false` if
   `options.interactive === false` or `tokenized.isNoPromptRequested === true`).
   Explicit CLI values never open `/dev/tty`. Once opened, the same session is
   reused across all prompts in that invocation and ALWAYS closed in `finally`
   before `targetState.action(parsedArgs)` executes.
2. **Bare multi-command action menu:** When `targetState.action === undefined`,
   `Object.keys(targetState.commands).length > 0`,
   `rawPositionalArgs.length === 0`, and `Object.keys(rawOptionArgs).length === 0`:
   - If an interactive session is available: renders a `requestChoiceMenu` with
     alphabetically sorted subcommands (`label: name`, `description:
cmd.state.description`). On selection, merges parent `globalOptionArgs`
     into the chosen subcommand, carries forward `rawGlobalOptionArgs`, appends
     the chosen command to `commandPath`, and recursively runs that subcommand
     (handling nested command groups and the chosen command's prompts/action).
   - If unattended (no TTY or `--no-prompt`): preserves PR 2 behavior and writes
     `generateHelpText(targetCLI, { commandPath })` to `stdout`.
3. **Parameter prompting (`promptCLIParam`):**
   - Interactive + `askIfEmpty`: uses `requestChoiceMenu` for `choices` and
     `type === "boolean"`, and `requestTerminalInput` for `string` / `number`.
     For variadic positional args with `choices`, prompts via choice menu (with
     skip when optional).
   - Unattended + missing `askIfEmpty` parameter: - If `required: true`: fails promptly with `CLIError.missingRequiredOption`
     or `CLIError.missingRequiredPositionalArg`, including a clear unattended
     message and an actionable recovery hint naming the exact flag or argument
     and example invocation (for example `Pass --format <value> (for example:
avandar-lint coverage --format <value>) or run avandar-lint coverage --help.`). - If `required: false`: skips prompting and falls back to `defaultValue`
     (or `[]` for variadic, or `undefined`).

## 6. Stream Separation (`Acclimate` & `executeCLI`)

### `Acclimate` Facade (`src/Acclimate.ts`)

- `Acclimate.log(message, params?, options?)`: Writes formatted diagnostic /
  progress text to `stderr` (`options?.stream ?? process.stderr`) using
  `generateTerminalMessage(message, params, { color })`, where `color` defaults
  to `isColorEnabledForStream({ stream })`. Keeps `stdout` strictly clean for
  machine data.
- `Acclimate.writeData(data, options?)`: Writes intentional machine-consumable
  data (`${data}\n` by default, or raw when `trailingNewline: false`) strictly
  to `stdout` (`options?.stream ?? process.stdout`) with no ANSI escapes.
- `Acclimate.writeJson(value, options?)`: Writes JSON-serialized data
  (`JSON.stringify(value, undefined, options?.pretty ? 2 : undefined) + "\n"`)
  strictly to `stdout` (`options?.stream ?? process.stdout`).
- `Acclimate.requestChoice(options)`: Public facade delegating to
  `requestChoiceMenu`.
- `Acclimate.requestInput(options)`: Delegates to updated `requestTerminalInput`
  (retaining full backwards compatibility for existing callers).
- `Acclimate.run(cli)`: Passes `process.stdin`, `process.stdout`,
  `process.stderr`, `process.env`, and `onExitCode` to `executeCLI`.

### `executeCLI` & `formatCLIError`

- `formatCLIError(error, options?: { color?: boolean })` passes `options` to
  `generateTerminalMessage` (defaulting to `color: true` for backwards
  compatibility).
- `executeCLI` passes `stdin`, `stderr`, `env`, `terminal`, `interactive`, and
  `openTty` through to `runCLI`, formats caught `CLIError` instances with
  `color: isColorEnabledForStream({ stream: stderr, env })`, writes errors
  strictly to `stderr`, leaves `stdout` untouched, and maps exit codes:
  - `0` on normal completion or `-h`/`--help` (without overwriting a user
    action's explicit `process.exitCode`).
  - `130` when `error instanceof CLIError && error.code === "prompt_cancelled"`.
  - `1` for all other errors.

## 7. Module Architecture

```text
src/
  CLIError.ts                                      # prompt_cancelled, interactive_input_unavailable, optional hint
  Acclimate.ts                                     # log -> stderr, writeData/writeJson -> stdout, requestChoice
  index.ts                                         # Export new helpers and types
  generateTerminalMessage/
    generateTerminalMessage.ts                     # bold token + optional { color?: boolean }
    generateTerminalMessage.test.ts
  terminalSession/
    terminalSession.types.ts                       # TerminalInputStream, TerminalOutputStream, TerminalSession
    isColorEnabledForStream/
      isColorEnabledForStream.ts                   # TTY + NO_COLOR + TERM=dumb check
      isColorEnabledForStream.test.ts
    openTerminalSession/
      openTerminalSession.ts                       # /dev/tty opener, attached-TTY guard, stdin+stderr fallback
      openTerminalSession.test.ts
  requestChoiceMenu/
    requestChoiceMenu.types.ts                     # ChoiceMenuItem, ChoiceMenuOptions
    MenuNavigation/
      MenuNavigation.ts                            # Pure key chunk parser & wrapping/g/G state transitions
      MenuNavigation.test.ts
    renderChoiceMenu/
      renderChoiceMenu.ts                          # Pure bold-green + ❯ cursor ANSI/plain renderer
      renderChoiceMenu.test.ts
    requestChoiceMenu.ts                           # Raw-mode & non-raw choice menu with guaranteed cleanup
    requestChoiceMenu.test.ts
  requestTerminalInput/
    requestTerminalInput.ts                        # TerminalSession IO, choice/boolean delegation, cancel, unattended
    requestTerminalInput.test.ts
  AcclimateCLI/
    formatCLIError/
      formatCLIError.ts                            # Optional { color?: boolean }
      formatCLIError.test.ts
    executeCLI/
      executeCLI.ts                                # Pass terminal/env/stdin/stderr, color-aware stderr, exit 130 on cancel
      executeCLI.test.ts                           # Unit + subprocess tests for JSON stdout, unattended fail-fast, cancel
    runCLI/
      attachCLIErrorHelpContext.ts                 # Preserve explicit error.hint; concise prompt_cancelled
      promptCLIParam/
        promptCLIParam.ts                          # Choice/boolean/text param prompting & unattended actionable errors
        promptCLIParam.test.ts
      tokenizeCLIInput/
        tokenizeCLIInput.ts                        # Built-in --no-prompt + propagation across subcommands
        __tests__/
          tokenizeCLIInput.noPrompt.test.ts
      runCLI.ts                                    # Lazy single TerminalSession, bare command menu, unattended fallback
      __tests__/
        runCLI.options.test.ts                     # Updated askIfEmpty tests with interactive terminal + clean stdout
        runCLI.positional.test.ts                  # Updated askIfEmpty tests with interactive terminal + clean stdout
        runCLI.variadic.test.ts                    # Updated askIfEmpty tests with interactive terminal + clean stdout
        runCLI.interactive.test.ts                 # Menus, bare multi-command, Ctrl-C/EOF, unattended, piped JSON stdout
  __tests__/
    acclimateStreams.integration.test.ts           # Acclimate.log -> stderr, writeData/writeJson -> stdout, NO_COLOR
docs/
  interactive-prompts.md                           # Architecture & contracts for /dev/tty, menus, unattended, streams
  argument-parsing.md                              # Document --no-prompt, unattended fallback, bare command menu
README.md                                          # Document requestChoice, writeData, writeJson, log -> stderr, menus
```

## 8. Verification Plan

- Red/green TDD for every new and modified module:
  - `generateTerminalMessage` (`bold` and `color: false`)
  - `isColorEnabledForStream` and `openTerminalSession` (`/dev/tty`, attached-TTY
    guard, `CI`, `--no-prompt`, fallback, fd cleanup)
  - `MenuNavigation` (Up/Down, `j`/`k` wrapping, `g`/`G`, `Home`/`End`, `1`-`9`,
    Enter, Ctrl-C, Ctrl-D, split escape sequences, buffered chunks, ignored keys)
  - `renderChoiceMenu` (bold-green + `❯` cursor, descriptions, defaults, plain
    mode without ANSI codes)
  - `requestChoiceMenu` (raw mode enter/restore on confirm/Ctrl-C/EOF, listener
    cleanup, non-raw fallback rejecting invalid input, unattended error)
  - `requestTerminalInput` (session output, clean `stdout`, choices/boolean
    delegation, number validation retry, Ctrl-C/EOF, unattended fallback)
  - `tokenizeCLIInput` (`--no-prompt` built-in and explicit declaration,
    subcommand propagation, `--` pass-through)
  - `promptCLIParam` and `runCLI` (choices menu, boolean menu, bare
    multi-command menu + nested subcommand recursion, Ctrl-C preventing actions,
    unattended required error naming flag/invocation, unattended optional
    defaults, piped `stdin` + clean JSON `stdout`)
  - `executeCLI` and real subprocess verification (`Acclimate.log` on `stderr`
    with pure `JSON.parse(stdout)`, unattended `askIfEmpty` failing fast without
    hanging, cancel exit code `130`).
- Full verification gate: `npm run type`, `npm run lint`, `npm test`, and
  `npm run build`.
- Finishing steps per `AGENTS.md`: `/avandar-code-review` across the branch,
  commit fixes, then full `/diff-review` walkthrough committed under
  `docs/code-walkthroughs/`.
