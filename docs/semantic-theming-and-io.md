# Semantic Theming and Injectable Execution IO

Acclimate centralizes all terminal styling in a dark-terminal semantic theme
layer and provides fully injectable execution IO with returned `Promise<number>`
exit codes so CLIs are ergonomic for humans and deterministic for tests and
automation.

## Semantic Theme Roles and Dark-Terminal Defaults

Rather than scattering raw ANSI escape sequences across command handlers,
Acclimate maps every visual role through `createTheme` (`src/theme/`). Because
terminals do not reliably report whether their background is light or dark, the
default dark-terminal palette (`DEFAULT_DARK_THEME_PALETTE`) uses high-contrast
tones strictly from the bright half of the ANSI SGR palette (`90`-`97`, plus
bold `1` on `selected`):

| Role       | Default ANSI SGR                            | Purpose                                                              |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `heading`  | `\x1b[93m` (`bright_yellow`)                | Help section headings (`Usage`, `Options`, `Commands`, `Examples`)   |
| `accent`   | `\x1b[96m` (`bright_cyan`)                  | CLI and command display names, primary emphasis                      |
| `value`    | `\x1b[97m` (`bright_white`)                 | Parameter names, command names, worked examples                      |
| `muted`    | `\x1b[90m` (`bright_black`)                 | Descriptions, `(optional)`, `(default)`, `[choices: ...]`, hints     |
| `success`  | `\x1b[92m` (`bright_green`)                 | Success banners (`✅`) and menu confirmations (`✔`)                  |
| `warning`  | `\x1b[93m` (`bright_yellow`)                | Warnings (`⚠️`), indented recovery hints, cancellations (`✖`)        |
| `error`    | `\x1b[91m` (`bright_red`)                   | Error headlines (`❌`), `required` markers, inline validation errors |
| `info`     | `\x1b[94m` (`bright_blue`)                  | Informational progress and diagnostic messages (`ℹ️`)                |
| `prompt`   | `\x1b[96m` (`bright_cyan`)                  | Interactive prompt questions (`? ...`)                               |
| `selected` | `\x1b[1m\x1b[92m` (`bold` + `bright_green`) | Active choice menu row (`❯ ...`)                                     |

### Plain-Mode Rules (`NO_COLOR`, `TERM=dumb`, Redirected Streams)

`isColorEnabledForStream` (`src/terminalSession/isColorEnabledForStream/`) is
the single gate controlling ANSI color output across help text, error/usage
formatting, interactive menus, prompts, `generateTerminalMessage`, and
`Acclimate` status helpers. ANSI escapes are disabled whenever **any** of these
conditions hold:

- The target stream is not a TTY (`stream.isTTY !== true`, or an explicit
  `isTTY` / `isStdoutTTY` / `isStderrTTY` override is `false`).
- `NO_COLOR` is set to a non-empty string (`env.NO_COLOR !== undefined &&
env.NO_COLOR !== ""`). An empty `NO_COLOR=""` does not disable color.
- `TERM === "dumb"`.

Plain mode preserves all readable text, emoji (`✅`, `ℹ️`, `⚠️`, `❌`), textual
menu cursors (`❯`), progress lines, and indented recovery hints while emitting
zero ANSI escape sequences. `formatCLIError` also sanitizes pre-attached
`error.usage` through `stripAnsi` when plain mode is active.

### Customizing Themes and Status Helpers

- **Pure standalone theme (`createTheme`):**
  - Accepts `{ color?, stream?, isTTY?, env?, palette? }`.
  - Palette overrides accept named ANSI tokens (`"bright_magenta"`), token
    arrays (`["bold", "bright_cyan"]`), or raw ANSI SGR prefixes
    (`"\x1b[38;5;117m"`).
  - Never reads global facade state, keeping unit modules deterministic.
- **Facade theme configuration (`Acclimate`):**
  - `Acclimate.theme` returns the active `stderr` semantic theme (scoped to the
    active `ExecutionIoContext` during a run, or bound to `process.stderr` and
    `process.env` outside a run).
  - `Acclimate.setTheme(paletteOverrides)` and `Acclimate.resetTheme()` manage
    default palette overrides across `Acclimate.theme`, `Acclimate.createTheme`,
    `Acclimate.log`, `Acclimate.print*`, and `Acclimate.run` / `Acclimate.execute`.
- **Semantic status helpers on `stderr`:**
  - `Acclimate.printSuccess(message, options?)` -> `✅ ...`
  - `Acclimate.printInfo(message, options?)` -> `ℹ️ ...`
  - `Acclimate.printWarn(message, options?)` -> `⚠️ ...`
  - `Acclimate.printError(message, options?)` -> `❌ ...` with optional indented
    `  ⚠️ <hint>` recovery guidance on a second line.
- **Semantic tokens in `generateTerminalMessage`:**
  - Supports both raw style tokens (`|bold|`, `|bright_cyan|`) and all ten
    semantic role tokens (`|heading|`, `|accent|`, `|value|`, `|muted|`,
    `|success|`, `|warning|`, `|error|`, `|info|`, `|prompt|`, `|selected|`).

## Injectable Execution IO and Exit-Code Propagation

Acclimate never calls `process.exit()` inside library code. All three execution
boundaries (`Acclimate.run`, `Acclimate.execute`, and `executeCLI`) return
`Promise<number>`:

- `0`: command action succeeded, `-h`/`--help` printed to `stdout`, or
  unattended actionless command printed usage to `stdout`.
- `130`: user cancelled an interactive prompt or choice menu (`Ctrl-C`/`EOF`).
- `1`: unknown flag, missing option value, validation/parsing `CLIError`,
  unattended missing required parameter, or uncaught error in `.action()`.

### `Acclimate.run(cli, options?)` vs `Acclimate.execute(cli, options?)`

- **CLI entry point (`Acclimate.run(cli)`):** Reads `process.argv.slice(2)`,
  uses `process.stdin`/`process.stdout`/`process.stderr`/`process.env`, sets
  `process.exitCode` on non-zero exit, and returns `Promise<number>`.
- **In-process testing and embedding (`Acclimate.run(cli, options)` /
  `Acclimate.execute(cli, options)`):** Accepts optional `{ args, stdin, stdout,
stderr, env, isStdoutTTY, isStderrTTY, terminal, promptIo, interactive,
openTty, theme, onExitCode, setProcessExitCode }`. Whenever any execution IO
  or `args` option is injected (or when calling `Acclimate.execute`), Acclimate
  does **not** mutate `process.exitCode` unless `setProcessExitCode: true` is
  explicitly requested.
- **`PromptIo` adapter:** Callers that do not need a full `TerminalSession` can
  pass `promptIo: { input, output, isColorEnabled?, isRawModeSupported?,
close? }`. `makeTerminalSessionFromPromptIo` derives color and raw-mode
  capabilities from the output stream and `env` (`NO_COLOR` / `TERM=dumb`).

### Async-Scoped Execution Context (`ExecutionIoContext`)

`runCLI` runs tokenization, help rendering, prompting, and `.action()` inside a
Node `AsyncLocalStorage` store (`ExecutionIoContext`). Inside a command action:

- `stdout` helpers (`Acclimate.writeData`, `Acclimate.writeJson`) write to the
  injected `stdout`.
- `stderr` helpers (`Acclimate.log`, `Acclimate.printSuccess`,
  `Acclimate.printInfo`, `Acclimate.printWarn`, `Acclimate.printError`,
  `Acclimate.theme`) write to the injected `stderr` with the injected `env`,
  `isStderrTTY`, and `theme`.
- Prompt helpers (`Acclimate.requestInput`, `Acclimate.requestChoice`) inherit
  the injected `terminal` / `promptIo`, streams, `env`, `interactive`, `openTty`,
  and theme unless overridden per call.

Because `AsyncLocalStorage` binds per async call tree, concurrent in-process
`Acclimate.run` calls remain completely isolated from each other.
