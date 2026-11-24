# Interactive Menus, `/dev/tty` IO, Unattended Fallback, and Stream Separation

Acclimate treats humans at a terminal and non-interactive automation (pipes,
CI jobs, and coding agents) as first-class audiences. Interactive prompts stay
isolated on the controlling terminal so piped `stdin` is never consumed as
answers and `stdout` stays clean for machine-consumable data.

## Controlling Terminal (`/dev/tty`) and Session Lifecycle

`openTerminalSession` (under `src/terminalSession/`) owns TTY capability
detection, controlling-terminal opening, and stream cleanup:

- **Attached-TTY guard:** When `interactive` is not explicitly forced,
  Acclimate checks whether at least one standard stream (`stdin`, `stdout`, or
  `stderr`) is attached to a TTY and whether `CI` is unset (`CI !== "true"` and
  `CI !== "1"`). When all three standard streams are redirected (for example
  `execFile`, agents, or `tool < /dev/null > out 2> err`), Acclimate enters
  unattended mode immediately instead of opening a parent shell's `/dev/tty` and
  hanging.
- **`/dev/tty` isolation:** When a terminal is attached (including pipelines such
  as `cat payload.json | tool --format json | jq .`, where `stderr.isTTY` is
  still `true`), Acclimate opens `/dev/tty` with separate read and write
  descriptors wrapped in `tty.ReadStream` and `tty.WriteStream`. Prompt input
  and menu rendering stay completely off `stdin` and `stdout`.
- **Safe fallback:** On platforms or environments where `/dev/tty` is
  unavailable, Acclimate falls back to `stdin` and `stderr` only when both are
  TTYs. It never falls back to piped `stdin` or to `stdout`.
- **Lazy single-session lifecycle:** `runCLI` opens a terminal session lazily
  only when a bare command menu or `askIfEmpty` prompt is actually needed.
  Explicit CLI values never open `/dev/tty`. Any opened session is restored to
  cooked mode and closed in `finally` before the matched command `.action()`
  executes.

## Interactive Choice Menus

`requestChoiceMenu` (exposed publicly and via `Acclimate.requestChoice`) powers
interactive selection menus across three layers:

1. **`MenuNavigation`:** Pure key-sequence parser and wrapping index reducer.
   Supports `Up`/`Down` arrows (`\x1b[A`, `\x1b[B`, `\x1bOA`, `\x1bOB`), Vim
   `j`/`k` with first/last wrapping, `g`/`G` and `Home`/`End` jumps to first
   and last, digits `1`-`9`, `Enter` confirm, `Ctrl-C` (`\x03`), `Ctrl-D`
   (`\x04`), split ANSI escape chunks, and multi-key buffers. Unrecognized keys
   are ignored.
2. **`renderChoiceMenu`:** Formats the prompt header, key hint, and items with
   the current selection in bold bright green plus a textual `❯` cursor,
   optional item descriptions, and `(default)` markers. Plain mode (`NO_COLOR`,
   `TERM=dumb`, or non-TTY output) strips ANSI codes while preserving the `❯`
   cursor and labels.
3. **`requestChoiceMenu`:** Drives raw-mode in-place redraws on capable TTYs,
   or a plain numbered fallback menu with retry validation when raw mode is
   unsupported (`TERM=dumb`). On confirm, cancel (`Ctrl-C` or `EOF`), or stream
   error, it restores raw mode, cursor visibility, and listeners before settling.

### Automatic Menu Usage in `runCLI`

- **Parameters with `choices`:** `askIfEmpty` parameters with a `choices` list
  render a choice menu automatically (adding a `(skip)` entry when optional
  with no `defaultValue`).
- **Boolean parameters:** `askIfEmpty` boolean parameters render a `Yes` / `No`
  choice menu on raw-capable TTYs (and `(y/n)` line validation in non-raw mode).
- **Bare actionless multi-command CLIs:** Running an actionless parent or group
  command with registered sub-commands bare in an interactive terminal opens an
  alphabetical sub-command menu, merges parent global options, preserves any
  supplied global option values, recurses into nested command groups, and runs
  the selected command's prompts and action.

## Unattended Mode and Cancellation

- **Entering unattended mode:** Triggered automatically when no standard stream
  is a TTY or `CI` is `"true"`/`"1"`, or explicitly via built-in `--no-prompt`
  (or `interactive: false`).
- **Unattended parameter rules:**
  - Missing **required** parameters (including those with `askIfEmpty`) fail
    promptly with `CLIError` (`missing_required_option` or
    `missing_required_positional_arg`), carrying an actionable message and
    recovery hint naming the flag or argument and example invocation.
  - Missing **optional** parameters skip prompting and apply `defaultValue` (or
    `[]` for variadic positionals, or `undefined`).
  - Bare actionless parent commands print help text to `stdout` instead of
    opening a menu.
- **Cancellation (`Ctrl-C` / `EOF`):** Aborts immediately with `CLIError`
  (`code: "prompt_cancelled"`), prevents subsequent prompts and command
  actions, writes a concise cancellation message to `stderr` (without dumping
  full usage), and exits with status `130` via `executeCLI` / `Acclimate.run`.

## Strict Stream Separation

| Output kind                            | Stream                   | Helper / Behavior                                                                  |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Machine data (JSON, paths, records)    | `stdout`                 | Command `.action()`, `Acclimate.writeData`, `Acclimate.writeJson`                  |
| Explicit `-h` / `--help`               | `stdout`                 | `runCLI` / `executeCLI` (exit `0`)                                                 |
| Conversational logs and progress       | `stderr`                 | `Acclimate.log` (strips color when redirected, `NO_COLOR`, or `TERM=dumb`)         |
| Errors, recovery hints, usage-on-error | `stderr`                 | `formatCLIError` via `executeCLI` / `Acclimate.run` (exit `1`, or `130` on cancel) |
| Interactive prompts and choice menus   | `/dev/tty` (or `stderr`) | `requestChoiceMenu`, `requestTerminalInput`, `runCLI`                              |
