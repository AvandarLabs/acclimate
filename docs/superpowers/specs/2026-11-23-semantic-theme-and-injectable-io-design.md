# Semantic Theming and Injectable Execution IO Design

**Date:** 2026-11-23
**Package:** `@avandar/acclimate`
**Branch:** `jpsyx/feat/semantic-theme-and-injectable-io`

## 1. Goal

Complete `@avandar/acclimate`'s terminal experience and testability story (PR 4
of 4) in alignment with `docs/rules/cli-ux.md`, `docs/rules/node.md`, and
`docs/rules/typescript.md`:

- **Dark-terminal semantic theming (`src/theme/`):** Provide a centralized
  semantic theme layer (`createTheme`, `Acclimate.createTheme`,
  `Acclimate.theme`, `Acclimate.setTheme`, `Acclimate.resetTheme`) covering all
  ten semantic roles (`heading`, `accent`, `value`, `muted`, `success`,
  `warning`, `error`, `info`, `prompt`, `selected`). Default colors assume a
  dark terminal and use high-contrast tones strictly from the bright half of the
  ANSI SGR palette (`90`-`97`, plus `1` bold on `selected`).
- **Strict plain-mode fallback:** Disable ANSI escape sequences whenever the
  target stream is not a TTY (redirected/piped), `NO_COLOR` is non-empty, or
  `TERM === "dumb"`, while preserving text, emoji, progress, choice cursors, and
  indented recovery guidance. Eliminate every unconditional ANSI leak in help
  output (`generateHelpText` via `runCLI`), error usage output
  (`attachCLIErrorHelpContext` + `formatCLIError`), interactive prompts, and
  status helpers.
- **Consistent semantic styling everywhere:** Route help rendering, error and
  recovery-hint formatting, choice menus, line prompts, `generateTerminalMessage`
  semantic tokens, and status helpers (`Acclimate.printSuccess`,
  `Acclimate.printInfo`, `Acclimate.printWarn`, `Acclimate.printError`) through
  the same semantic theme layer.
- **Injectable execution IO and returned exit codes:** Upgrade `Acclimate.run`
  to return `Promise<number>` and accept optional injectable execution options
  (`{ args, stdin, stdout, stderr, env, isStdoutTTY, isStderrTTY, terminal,
promptIo, interactive, openTty, theme, onExitCode, setProcessExitCode }`),
  alongside `Acclimate.execute(cli, options)` for pure embedded execution.
  Scope injected streams, environment, TTY flags, prompt IO, and semantic themes
  across async command actions via `AsyncLocalStorage` so in-process tests and
  embedded callers capture all `Acclimate.*` output cleanly without calling
  `process.exit()` or clobbering `process.exitCode`.

## 2. Design Approaches Considered

### Approach A: Pure Semantic Theme Layer + Stream-Bound Execution + `AsyncLocalStorage` IO Context (Recommended)

1. Introduce a zero-dependency `src/theme/` subsystem with `theme.constants.ts`
   (bright dark-terminal default palette and ANSI style code table),
   `theme.types.ts`, `createTheme`, `stripAnsi`, and `makeThemeFromOptions`.
2. Extend `isColorEnabledForStream` to accept an optional `isTTY` override
   alongside `stream` and `env`, keeping `NO_COLOR` (non-empty) and
   `TERM === "dumb"` authoritative over TTY flags.
3. Extend `generateTerminalMessage` to resolve semantic role tokens
   (`|heading|`, `|accent|`, `|value|`, `|muted|`, `|success|`, `|warning|`,
   `|error|`, `|info|`, `|prompt|`, `|selected|`) from a `SemanticTheme` and
   respect `{ color, theme, stream, isTTY, env }`.
4. Migrate `generateHelpText`, `formatCLIError`, `attachCLIErrorHelpContext`,
   `renderChoiceMenu`, `requestChoiceMenu`, `runPlainChoiceMenu`,
   `requestTerminalInput`, and `promptCLIParam` onto `SemanticTheme` so help
   output on `stdout` and error+usage output on `stderr` each bind to their own
   stream's TTY/`NO_COLOR`/`TERM` state.
5. Add `PromptIo` + `makeTerminalSessionFromPromptIo` under
   `src/terminalSession/` and `ExecutionIoContext` (`AsyncLocalStorage`) under
   `src/AcclimateCLI/ExecutionIoContext/`.
6. Upgrade `Acclimate.run(cli, options?)` to return `Promise<number>` (setting
   `process.exitCode` only for non-injected CLI entry-point calls unless
   `setProcessExitCode` is explicitly set), add `Acclimate.execute(cli,
options?)`, and add `Acclimate.theme`, `Acclimate.createTheme`,
   `Acclimate.setTheme`, `Acclimate.resetTheme`, `Acclimate.printSuccess`,
   `Acclimate.printInfo`, `Acclimate.printWarn`, and `Acclimate.printError`.

- **Pros:** Zero new runtime dependencies; keeps all core helpers pure and
  deterministically testable; eliminates ANSI leaks in piped help and
  usage-on-error; `AsyncLocalStorage` isolates concurrent in-process test runs
  even when `.action()` invokes `Acclimate.log`, `Acclimate.writeJson`,
  `Acclimate.print*`, or `Acclimate.requestChoice`; preserves full backwards
  compatibility with PR 1, PR 2, and PR 3 APIs.
- **Cons:** Introduces `node:async_hooks` (`AsyncLocalStorage`, built into
  Node 18+); requires updating existing exact-ANSI unit assertions where dark
  `\x1b[31m`/`\x1b[33m` or `\x1b[2m` tokens were previously hardcoded.

### Approach B: Add `chalk` or `picocolors` and Require Actions to Receive a Context Parameter

Depend on a third-party color package and change `.action((args, ctx) => ...)`
to pass IO handles as a second argument.

- **Pros:** Explicit IO parameter inside actions without `AsyncLocalStorage`.
- **Cons:** Adds third-party runtime dependencies against `docs/rules/node.md`;
  breaks or complicates existing `.action((args) => ...)` signatures across
  callers that use `Acclimate.writeJson` and `Acclimate.log` directly; external
  color libraries do not integrate with Acclimate's `|token|` templates or
  per-stream TTY overrides cleanly.

### Approach C: Global Mutable Stream/Theme Singletons Without Per-Call Injection

Store global `currentStdout`, `currentStderr`, and `currentTheme` variables
mutated by `Acclimate.run`.

- **Pros:** Minimal code.
- **Cons:** Unsafe under concurrent async runs or parallel Vitest tests; violates
  `docs/rules/node.md` guidance against process-wide mutable state in library
  internals.

### Decision

Adopt **Approach A**. Pure per-stream theme derivation paired with
`AsyncLocalStorage` execution scoping provides clean concurrency, zero new
runtime dependencies, complete dark-terminal semantic consistency, and seamless
in-process integration testing.

## 3. Semantic Theme Subsystem (`src/theme/`)

### 3.1 Semantic Roles and Default Dark-Terminal Palette

`src/theme/theme.constants.ts` defines the single source of truth for roles,
named style tokens, and the default dark-terminal palette:

| Role       | Default ANSI SGR  | Named Token(s)             | Purpose                                                                    |
| ---------- | ----------------- | -------------------------- | -------------------------------------------------------------------------- |
| `heading`  | `\x1b[93m`        | `bright_yellow`            | Help section headings (`Usage`, `Options`, `Commands`, `Examples`)         |
| `accent`   | `\x1b[96m`        | `bright_cyan`              | CLI and command display names, primary emphasis                            |
| `value`    | `\x1b[97m`        | `bright_white`             | Option/argument/command names, worked example commands, chosen values      |
| `muted`    | `\x1b[90m`        | `bright_black` (`gray`)    | Secondary descriptions, hints, `(optional)`, `(default)`, `[choices: ...]` |
| `success`  | `\x1b[92m`        | `bright_green`             | Success banners (`✅`), confirmation markers (`✔`)                         |
| `warning`  | `\x1b[93m`        | `bright_yellow`            | Warnings (`⚠️`), indented recovery hints, cancellation notices             |
| `error`    | `\x1b[91m`        | `bright_red`               | Error headers (`❌`), `required` markers, inline validation errors         |
| `info`     | `\x1b[94m`        | `bright_blue`              | Informational progress and status notices (`ℹ️`)                           |
| `prompt`   | `\x1b[96m`        | `bright_cyan`              | Interactive prompt questions (`? ...`, `askIfEmpty` messages)              |
| `selected` | `\x1b[1m\x1b[92m` | `["bold", "bright_green"]` | Active choice menu row (`❯ ...`)                                           |

Every default foreground color belongs strictly to the bright half of the ANSI
palette (`90`-`97`), with zero dark foreground SGR codes (`30`-`37`). Unit tests
explicitly verify that no role in `DEFAULT_DARK_THEME_PALETTE` emits `\x1b[3[0-7]m`.

### 3.2 Types (`src/theme/theme.types.ts`)

```ts
export type SemanticThemeRole = (typeof SEMANTIC_THEME_ROLES)[number];

export type AnsiStyleToken = keyof typeof ANSI_STYLE_CODES;

export type SemanticRoleStyleInput =
  | AnsiStyleToken
  | readonly AnsiStyleToken[]
  | `\x1b[${string}`;

export type SemanticThemePalette = Record<SemanticThemeRole, string>;

export type SemanticThemePaletteOverrides = Partial<
  Record<SemanticThemeRole, SemanticRoleStyleInput>
>;

export type CreateThemeOptions = {
  color?: boolean;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  palette?: Readonly<SemanticThemePaletteOverrides>;
};

export type SemanticTheme = {
  isColorEnabled: boolean;
  palette: SemanticThemePalette;
  style: (role: SemanticThemeRole, text: string) => string;
  withColor: (isColorEnabled: boolean) => SemanticTheme;
  heading: (text: string) => string;
  accent: (text: string) => string;
  value: (text: string) => string;
  muted: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  error: (text: string) => string;
  info: (text: string) => string;
  prompt: (text: string) => string;
  selected: (text: string) => string;
};

export type ThemeInput = SemanticTheme | SemanticThemePaletteOverrides;
```

### 3.3 Color Detection Rules (`isColorEnabledForStream` & `createTheme`)

`isColorEnabledForStream` is updated to:

```ts
export function isColorEnabledForStream(options: {
  stream?: Readonly<TerminalOutputStream>;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
}): boolean {
  const env = options.env ?? process.env;
  const isNoColorSet = env.NO_COLOR !== undefined && env.NO_COLOR !== "";
  const isDumbTerm = env.TERM === "dumb";
  const isTty = options.isTTY ?? options.stream?.isTTY === true;
  return isTty && !isNoColorSet && !isDumbTerm;
}
```

`createTheme(options)` determines `isColorEnabled` as follows:

1. If `options?.color !== undefined`: use `options.color` directly.
2. Otherwise: call `isColorEnabledForStream` with `stream: options?.stream ??
(options?.isTTY === undefined ? process.stderr : undefined)`, `isTTY:
options?.isTTY`, and `env: options?.env`.

When `isColorEnabled` is `false`, `theme.style(role, text)` and every role
helper return `text` unchanged (no ANSI escapes, preserving emoji and
punctuation). When `isColorEnabled` is `true`, `theme.style(role, text)` returns
`${palette[role]}${text}\x1b[0m` (and returns `""` unchanged if `text === ""`,
avoiding empty ANSI noise).

`stripAnsi(text)` (`src/theme/stripAnsi/stripAnsi.ts`) removes CSI ANSI SGR and
control escape sequences (`\x1b\[[0-9;?]*[ -/]*[@-~]`) for defense-in-depth
plain-mode sanitization.

`makeThemeFromOptions(options)` (`src/theme/makeThemeFromOptions/`) normalizes
an optional `ThemeInput`, `color`, `stream`, `isTTY`, `env`, and `defaultColor`
into a single `SemanticTheme` for callers across `generateHelpText`,
`formatCLIError`, `generateTerminalMessage`, `runCLI`, and `Acclimate`.

### 3.4 `generateTerminalMessage` Integration

`generateTerminalMessage(message, params?, options?)` extends `options` to:

```ts
type GenerateTerminalMessageOptions = {
  color?: boolean;
  theme?: SemanticTheme;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};
```

Behavior:

- Recognizes all existing raw color/style tokens (`|red|`, `|bold|`,
  `|bright_green|`, `|reset|`, etc.) **plus** all ten semantic role tokens
  (`|heading|`, `|accent|`, `|value|`, `|muted|`, `|success|`, `|warning|`,
  `|error|`, `|info|`, `|prompt|`, `|selected|`), mapping semantic tokens via
  `options.theme?.palette ?? DEFAULT_DARK_THEME_PALETTE`.
- Color toggle precedence:
  1. Explicit `options.color` if provided.
  2. `options.theme.isColorEnabled` if `options.theme` is provided.
  3. `isColorEnabledForStream({ stream, isTTY, env })` if any of `stream`,
     `isTTY`, or `env` is provided.
  4. `true` when called with no color/stream/env/theme options (backwards
     compatible with existing direct calls).
- When color is disabled, strips both known raw style tokens and semantic role
  tokens while leaving unknown tokens (such as `|nope|`) intact.

## 4. Consistent Semantic Theme Usage Across Rendering Surfaces

### 4.1 Help Text (`generateHelpText`)

`generateHelpText(cli, options?)` accepts:

```ts
type GenerateHelpTextOptions = {
  commandPath?: readonly string[];
  color?: boolean;
  theme?: ThemeInput;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};
```

- When called with no `color`, `theme`, `stream`, `isTTY`, or `env`, defaults
  to `color: true` (preserving direct unit call backwards compatibility).
- Replaces all hardcoded `|...|` color strings with `SemanticTheme` calls:
  - Display name -> `theme.accent(...)`
  - Section headers (`Usage`, `Positional Arguments`, `Options`,
    `Global Options`, `Examples`, `Commands`) -> `theme.heading(...)`
  - Descriptions, `optional`, `[choices: ...]`, `[default: ...]`,
    `No description` -> `theme.muted(...)`
  - `required` -> `theme.error("required")`
  - Parameter display names, example commands, level-2 command bullets ->
    `theme.value(...)`
- In `runCLI`, help printed to `stdout` (`--help`, `-h`, and unattended
  actionless commands) passes `theme: stdoutTheme`, ensuring piped `stdout`,
  `NO_COLOR`, or `TERM=dumb` emits 100% plain text with zero ANSI escapes.

### 4.2 Error and Recovery Formatting (`attachCLIErrorHelpContext` & `formatCLIError`)

- `attachCLIErrorHelpContext` accepts optional `theme?: SemanticTheme` and
  passes `{ commandPath, theme }` to `generateHelpText`, so `error.usage`
  attached during `tokenizeCLIInput` or `runCLI` matches `stderr`'s exact theme
  and color mode.
- `formatCLIError(error, options?)` accepts `{ color?, theme?, stream?, isTTY?,
env? }` (defaulting `color: true` when none are provided):
  - Error header: `theme.error(error.message)`
  - Recovery hint (when present): `` `  ${theme.warning(`⚠️ ${error.hint}`)}` ``
  - Usage (when present): preserved as-is when `theme.isColorEnabled`, or passed
    through `stripAnsi(error.usage)` when `!theme.isColorEnabled` so plain mode
    never leaks ANSI escapes even for manually constructed `CLIError` objects.

### 4.3 Interactive Prompts and Choice Menus

- `renderChoiceMenu` accepts optional `theme?: SemanticTheme` alongside
  `isColorEnabled` and uses `theme.prompt`, `theme.muted`, and `theme.selected`.
- `requestChoiceMenu` accepts optional `theme?: SemanticTheme` in
  `ChoiceMenuOptions`, syncs it to `session.isColorEnabled` via
  `withColor(session.isColorEnabled)`, passes it to `renderChoiceMenu` and
  `runPlainChoiceMenu`, and formats cancel (`theme.warning("✖ Cancelled")`) and
  confirm (`${theme.success("✔")} ${theme.prompt(message)}: ${label}`) lines
  semantically.
- `runPlainChoiceMenu` uses the synced theme for prompt heading, default/
  description text, and invalid-selection retry feedback (emitting zero ANSI
  escapes when `session.isColorEnabled` is `false`).
- `requestTerminalInput` accepts optional `theme?: SemanticTheme` in
  `RequestTerminalInputOptions`, styles prompt hints with `theme.muted`, styles
  inline validation errors with `theme.error`, and forwards `theme` to
  `requestChoiceMenu` and `generateTerminalMessage`.
- `promptCLIParam` accepts optional `theme?: SemanticTheme`, emits
  `|prompt|${baseMessage}|reset|` and forwards `theme` to
  `requestTerminalInput`.

### 4.4 Semantic Status Output Helpers on `Acclimate`

All status helpers write to `stderr` (or the active `ExecutionIoContext`
`stderr`, or an explicit `options.stream`) and respect `isTTY`, `env`, `color`,
and `theme`:

- `Acclimate.printSuccess(message, options?)` -> `✅ ${message}` styled with
  `theme.success` (without duplicating a leading `✅`).
- `Acclimate.printInfo(message, options?)` -> `ℹ️ ${message}` styled with
  `theme.info` (without duplicating a leading `ℹ️`).
- `Acclimate.printWarn(message, options?)` -> `⚠️ ${message}` styled with
  `theme.warning` (without duplicating a leading `⚠️`).
- `Acclimate.printError(message, options?)` -> `❌ ${message}` styled with
  `theme.error` (without duplicating a leading `❌`), followed by an indented
  `  ⚠️ ${options.hint}` line styled with `theme.warning` when `options?.hint`
  is supplied.
- `Acclimate.log(message, params?, options?)` -> retains its existing signature
  and adds optional `isTTY` and `theme`, honoring the active
  `ExecutionIoContext` and `Acclimate`'s configured default palette.

## 5. Injectable Execution IO and Exit-Code Propagation

### 5.1 `PromptIo` and `makeTerminalSessionFromPromptIo`

`src/terminalSession/terminalSession.types.ts` adds:

```ts
export type PromptIo = {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  isColorEnabled?: boolean;
  isRawModeSupported?: boolean;
  close?: () => void | Promise<void>;
};
```

`makeTerminalSessionFromPromptIo({ promptIo, env })` builds a `TerminalSession`:

- `isColorEnabled`: `promptIo.isColorEnabled ?? isColorEnabledForStream({ stream:
promptIo.output, env })`.
- `isRawModeSupported`: `promptIo.isRawModeSupported ?? (env.TERM !== "dumb" &&
typeof promptIo.input.setRawMode === "function")`.
- `close`: invokes `await promptIo.close?.()`.

### 5.2 Stream TTY Overrides and `ExecutionIoContext`

When `isStdoutTTY` or `isStderrTTY` is passed to `runCLI`, `executeCLI`,
`Acclimate.run`, or `Acclimate.execute`, the framework wraps the stream facade
with `{ write: (chunk) => stream.write(chunk), isTTY: override }` before passing
it to `isColorEnabledForStream` and `openTerminalSession`. This ensures both
color detection and attached-TTY detection consistently reflect the override
without mutating caller-owned stream objects (such as `process.stdout`).

`ExecutionIoContext` (`src/AcclimateCLI/ExecutionIoContext/`) wraps a Node
`AsyncLocalStorage<ExecutionIoStore>`:

```ts
export type ExecutionIoStore = {
  stdin: TerminalInputStream;
  stdout: TerminalOutputStream;
  stderr: TerminalOutputStream;
  env: Readonly<Record<string, string | undefined>>;
  stdoutTheme: SemanticTheme;
  stderrTheme: SemanticTheme;
  terminal?: TerminalSession;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
};
```

`runCLI` enters `ExecutionIoContext.run(store, ...)` for the duration of
command tokenization, prompting, help rendering, and `.action()` execution.
Inside an action:

- `Acclimate.writeData` and `Acclimate.writeJson` default `stream` to
  `store.stdout`.
- `Acclimate.log` and `Acclimate.printSuccess/Info/Warn/Error` default `stream`
  to `store.stderr`, `env` to `store.env`, and base theme to `store.stderrTheme`.
- `Acclimate.theme` returns `store.stderrTheme` when inside a run, or a live
  theme bound to `process.stderr`, `process.env`, and `Acclimate`'s configured
  default palette outside a run.
- `Acclimate.requestInput` and `Acclimate.requestChoice` inherit `store.terminal`,
  `store.stdin`, `store.stdout`, `store.stderr`, `store.env`,
  `store.interactive`, `store.openTty`, and `store.stderrTheme` whenever the
  caller does not explicitly override those fields.

### 5.3 `Acclimate.run`, `Acclimate.execute`, and `executeCLI`

```ts
export type AcclimateRunOptions = {
  args?: readonly string[];
  stdin?: TerminalInputStream;
  stdout?: TerminalOutputStream;
  stderr?: TerminalOutputStream;
  env?: Readonly<Record<string, string | undefined>>;
  isStdoutTTY?: boolean;
  isStderrTTY?: boolean;
  terminal?: TerminalSession;
  promptIo?: PromptIo;
  interactive?: boolean;
  openTty?: () => Promise<TerminalSession | undefined>;
  theme?: ThemeInput;
  onExitCode?: (exitCode: number) => void;
  setProcessExitCode?: boolean;
};
```

- **`Acclimate.run(cli, options?): Promise<number>`**
  - Never calls `process.exit()`.
  - Uses `options?.args ?? process.argv.slice(2)`, injecting `stdin`, `stdout`,
    `stderr`, `env`, `isStdoutTTY`, `isStderrTTY`, `terminal`, `promptIo`,
    `interactive`, `openTty`, and `theme` (falling back to `Acclimate`'s active
    palette when `options?.theme` is omitted).
  - Returns `Promise<number>`: `0` on success, `-h`/`--help`, or unattended
    actionless usage; `130` on `prompt_cancelled`; `1` on unknown flags,
    validation/parsing `CLIError`s, or uncaught action errors. Never rejects.
  - **`process.exitCode` behavior:**
    - If `options?.setProcessExitCode === true`, assigns `process.exitCode =
exitCode` on non-zero exit.
    - If `options?.setProcessExitCode === false` or `options?.onExitCode` is
      provided, does not mutate `process.exitCode`.
    - Otherwise, assigns `process.exitCode` only when no execution IO/args
      boundary options (`args`, `stdin`, `stdout`, `stderr`, `env`,
      `isStdoutTTY`, `isStderrTTY`, `terminal`, `promptIo`, `openTty`) were
      injected. Standalone CLI entry points (`Acclimate.run(cli)` and
      `Acclimate.run(cli, { theme })`) keep exact subprocess exit-code behavior,
      while in-process tests (`await Acclimate.run(cli, { args, stdout, stderr
})`) never pollute `process.exitCode`.
- **`Acclimate.execute(cli, options?): Promise<number>`**
  - Equivalent to `Acclimate.run(cli, { ...options, setProcessExitCode: false })`
    for callers that want an explicit embedded execution entry point that never
    touches `process.exitCode`.
- **`executeCLI(options): Promise<number>`**
  - Keeps 100% backwards compatibility with `executeCLI({ cli, input, ... })`.
  - Also accepts `args` (optional alias for `input`; defaults to
    `process.argv.slice(2)` if neither `args` nor `input` is given),
    `isStdoutTTY`, `isStderrTTY`, `promptIo`, and `theme`.

### 5.4 `Acclimate.setTheme` and `Acclimate.resetTheme`

- `Acclimate.setTheme(paletteOverrides)` replaces the facade's default palette
  overrides (affecting `Acclimate.theme`, `Acclimate.createTheme`,
  `Acclimate.log`, `Acclimate.print*`, and `Acclimate.run` / `Acclimate.execute`
  when no per-call `theme` is supplied).
- `Acclimate.resetTheme()` clears facade overrides back to
  `DEFAULT_DARK_THEME_PALETTE`.
- Standalone `createTheme(options)` never reads facade state, keeping unit
  modules pure and side-effect-free.

## 6. Testing Strategy (Red/Green TDD)

Every subsystem is implemented test-first with focused unit tests and in-process
plus subprocess integration tests:

1. **`src/theme/stripAnsi/stripAnsi.test.ts`:** Strips SGR color codes and CSI
   cursor control sequences while preserving text, Unicode, and emoji.
2. **`src/theme/createTheme/createTheme.test.ts`:**
   - Verifies every default semantic role (`heading`, `accent`, `value`,
     `muted`, `success`, `warning`, `error`, `info`, `prompt`, `selected`) emits
     high-contrast bright-half ANSI SGR sequences (`90`-`97`, plus bold `1` on
     `selected`) and zero dark foreground codes (`30`-`37`).
   - Verifies plain mode disables ANSI escapes for redirected streams
     (`isTTY: false` or omitted), non-empty `NO_COLOR`, and `TERM === "dumb"`,
     while allowing color when `isTTY: true`, `NO_COLOR: ""` or unset, and
     standard `TERM`.
   - Verifies custom palette overrides (named tokens, token arrays, raw ANSI
     sequences) and `withColor()`.
3. **`src/theme/makeThemeFromOptions/makeThemeFromOptions.test.ts`:** Verifies
   precedence across explicit `color`, `ThemeInput` (theme instance vs palette
   override), `isTTY`, `stream.isTTY`, `NO_COLOR`, and `TERM=dumb`.
4. **`src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`:**
   Covers `isTTY` override precedence alongside `NO_COLOR` and `TERM=dumb`.
5. **`src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.test.ts`:**
   Verifies `PromptIo` conversion, `NO_COLOR`/`TERM=dumb` color suppression,
   raw-mode gating on `TERM=dumb`, and `close()` forwarding.
6. **`src/generateTerminalMessage/generateTerminalMessage.test.ts`:** Covers all
   semantic role tokens (`|heading|`, `|error|`, `|selected|`, etc.), custom
   themes, stream/env/TTY-driven plain mode, and backwards-compatible raw tokens.
7. **`src/AcclimateCLI/generateHelpText/generateHelpText.test.ts` &
   `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`:** Verifies semantic
   theme application (including custom themes), bright dark-terminal defaults,
   plain-mode output on non-TTY/`NO_COLOR`/`TERM=dumb`, and ANSI stripping of
   pre-attached `error.usage` in plain mode.
8. **`src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.test.ts`,
   `src/requestChoiceMenu/requestChoiceMenu.test.ts`,
   `src/requestTerminalInput/requestTerminalInput.test.ts`:** Verifies semantic
   theme customization and plain-mode preservation of `❯`, emoji, and labels.
9. **`src/__tests__/acclimateRunAndTheme.integration.test.ts`:**
   - End-to-end in-process `await Acclimate.run(cli, { args, stdout, stderr,
env, isStdoutTTY, isStderrTTY, promptIo, theme })` and `Acclimate.execute`.
   - Exit-code propagation (`0` on success/help, `1` on unknown flag /
     validation error / thrown action error, `130` on prompt cancellation)
     without mutating `process.exitCode` or calling `process.exit()`.
   - `NO_COLOR`, `TERM=dumb`, and redirected stream plain-mode verification for
     help on `stdout`, errors + recovery hints + usage on `stderr`, choice menus
     via `promptIo`, and `Acclimate.printSuccess/Info/Warn/Error`.
   - `AsyncLocalStorage` isolation across concurrent in-process `Acclimate.run`
     calls whose `.action()` uses `Acclimate.writeJson`, `Acclimate.log`, and
     `Acclimate.printSuccess`.
   - `Acclimate.setTheme` / `Acclimate.resetTheme` and `Acclimate.theme`.
10. **`src/AcclimateCLI/executeCLI/__tests__/executeCLI.subprocess.test.ts`:**
    Verifies real subprocess `Acclimate.run(cli)` exits with `0` on `--help`
    (plain text when piped, zero ANSI escapes), exits `1` on unknown flags with
    plain `stderr` including usage (zero ANSI escapes), and respects
    `NO_COLOR=1` and `TERM=dumb`.

## 7. Public API Summary (`src/index.ts`)

- Existing exports remain unchanged and backwards compatible.
- New runtime exports: `createTheme`, `stripAnsi`, `DEFAULT_DARK_THEME_PALETTE`,
  `SEMANTIC_THEME_ROLES`, `ANSI_STYLE_CODES`.
- New `Acclimate` facade members: `run` (now returning `Promise<number>` and
  accepting optional `AcclimateRunOptions`), `execute`, `theme`, `createTheme`,
  `setTheme`, `resetTheme`, `printSuccess`, `printInfo`, `printWarn`,
  `printError`.
- New type exports: `AcclimateRunOptions`, `AcclimateLogOptions`,
  `AcclimateStatusPrintOptions`, `AcclimateErrorPrintOptions`,
  `ExecuteCLIOptions`, `RunCLIOptions`, `PromptIo`, `AnsiStyleToken`,
  `CreateThemeOptions`, `SemanticRoleStyleInput`, `SemanticTheme`,
  `SemanticThemePalette`, `SemanticThemePaletteOverrides`, `SemanticThemeRole`,
  `ThemeInput`.
