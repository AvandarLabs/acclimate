# @avandar/acclimate

## 0.5.0

### Minor Changes

- Adds variadic positional arguments that collect multiple values. A variadic positional argument must be the last one, otherwise `addPositionalArg` throws a `CLIError`.

- Adds injectable I/O to `Acclimate.run` via options such as `args`, `stdin`, `stdout`, `stderr`, `env`, `terminal`, `theme` and `onExitCode`, and `run` now returns a promise. Also adds `Acclimate.execute`, which runs a CLI without setting `process.exitCode`.

- Adds a built-in `--help` / `-h` option that shows help for a command, unless you define your own `--help`. Help output now also lists each option's allowed choices.

- Adds `usage()` and `addExample()` builder methods to override the usage synopsis and add worked examples. Help output now includes Usage and Examples sections.

- Allows `action` handlers to return a `Promise<void>` as well as `void`.

- Changes `Acclimate.run` to write help to stdout and render `CLIError`s to stderr with a recovery hint and usage instead of a raw stack trace. It also sets `process.exitCode` to 1 on failure.

- Changes `Acclimate.log` to write to stderr instead of stdout, so stdout stays clean for data. Color is now stripped on redirected streams, with a nonempty `NO_COLOR`, or with `TERM=dumb`.

- Adds `Acclimate.writeData` and `Acclimate.writeJson` for writing machine-readable text or JSON exclusively to stdout, with optional pretty-printing and trailing-newline control.

- Adds `Acclimate.requestChoice`, an interactive choice menu on the controlling terminal with arrow keys, `j`/`k`, `g`/`G`, Enter to confirm and Ctrl-C to cancel. `requestInput` now prompts over `/dev/tty` and uses menus for `choices` and boolean prompts. Cancelling a prompt exits with code 130.

- Adds a semantic theme API: `Acclimate.theme`, `createTheme`, `setTheme` and `resetTheme`. It also adds `printSuccess`, `printInfo`, `printWarn` and `printError` helpers that write themed status lines to stderr.
