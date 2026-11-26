# CLI experience rules

Acclimate is a framework for building CLI tools that both people type at and
agents script. Both audiences are first-class, and these rules guide the
behavior Acclimate provides out of the box (argument parsing, help output,
interactive prompting, terminal styling, error reporting, and exit codes).

## Stdout is data, stderr is the conversation

Stdout carries only intentional command output: the answer a command was asked
for, in a shape another program can consume (`key=value` lines, a path, a JSON
document). Everything else belongs on stderr: progress, interactive prompts,
warnings, help-on-error, and argument parsing failures.

CLIs built with Acclimate may be piped into other tools, so framework
diagnostics written to stdout are a bug. Keep new framework diagnostics,
prompts, and error output on stderr (while respecting existing public helper
contracts such as `Acclimate.log` unless intentionally changed).

## Two audiences, both first-class

- **An agent must be able to drive everything non-interactively.** Every action
  must be reachable through subcommands, positional arguments, or flags. No
  behavior should be accessible only through an interactive prompt, and no
  command should block on stdin when values were already supplied on the
  command line.
- **A human who omits a value gets asked, not rejected.** When a required value
  is configured for interactive prompting (for example via `askIfEmpty` or
  `requestInput`) and stdin/stderr are attached to a terminal (TTY), ask for it
  clearly. With no terminal (a pipe, CI job, or agent), fail fast with an error
  message that names the argument or flag that would have supplied the value.

Interactive prompt helpers must own the TTY check centrally so commands never
read raw stdin directly and hang on a pipe.

When a CLI supports configuration defaults alongside flags and prompts, follow
a clear precedence order: CLI flag/argument, then configuration/environment,
then interactive prompt (TTY only), then a clear error naming the flag.

## Narrate by default, detail under `--verbose`

When an operation may spend noticeable time (reading many files, touching the
network, waiting on a child process), short factual progress lines belong on
stderr before each phase so a user never wonders whether the tool is hung.
Reserve detailed diagnostics for `--verbose`.

## All color is semantic, and the terminal is dark

Prefer semantic styling roles (`heading`, `accent`, `value`, `muted`,
`success`, `warning`, `error`, `info`, `prompt`) over scattering raw ANSI
escape codes across callers. Centralize color mapping in a theme layer so
consumers style by meaning (a failure is `error`, a command name is `accent`,
a hint is `muted`) and can customize palettes in one place.

Terminals do not reliably report whether they are light or dark, so default
palettes should assume a **dark** background and use readable tones from the
bright half of the ANSI palette, verified by unit tests. Emit color codes only
when the target stream is a TTY and `NO_COLOR` is unset, so piped output stays
plain text.

## Exit codes are part of the interface

Exit `0` only when a command succeeds. Any parsing error, validation error
(`CliError`), or command failure must exit non-zero after printing a concise,
user-friendly message (never a raw internal stack trace for user input errors)
and, when applicable, the flag or usage hint that fixes it. Scripts and agents
branch on the exit code before reading output.
