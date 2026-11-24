# Interactive Menus, `/dev/tty` Prompt IO, Unattended Fallback, and Stream Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlling-terminal (`/dev/tty`) prompt/menu IO, arrow/`j`/`k`/`g`/`G` choice menus (for choices, booleans, and bare multi-command CLIs), unattended non-TTY / `--no-prompt` fallback, and strict `stdout`/`stderr` stream separation to `@avandar/acclimate`.

**Architecture:** Isolate terminal detection and `/dev/tty` lifecycle in `src/terminalSession/`, separate pure menu key-parsing and ANSI/plain rendering from raw-mode IO in `src/requestChoiceMenu/`, migrate `requestTerminalInput` onto `TerminalSession`, and wire built-in `--no-prompt`, lazy `/dev/tty` prompting, bare command menus, and strict `stdout`/`stderr` stream contracts through `tokenizeCLIInput`, `promptCLIParam`, `runCLI`, `executeCLI`, and `Acclimate`.

**Tech Stack:** TypeScript 5.9 (ESM, strict, `noUncheckedIndexedAccess`), Node.js >= 18 built-ins (`node:fs`, `node:tty`, `node:util`, `node:readline/promises`, `node:stream`), Vitest, ESLint, Prettier, tsup. Zero new runtime dependencies.

---

### Task 1: Add `bold` Token and Plain-Mode `{ color?: boolean }` to `generateTerminalMessage`

**Files:**

- Modify: `src/generateTerminalMessage/generateTerminalMessage.ts`
- Modify: `src/generateTerminalMessage/generateTerminalMessage.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests to `src/generateTerminalMessage/generateTerminalMessage.test.ts` asserting:

1. `|bold||bright_green|Selected|reset|` produces `\x1b[1m\x1b[92mSelected\x1b[0m`.
2. Passing `{ color: false }` strips known color/style tokens (`|bold|`, `|red|`, `|bright_green|`, `|reset|`) without emitting ANSI escapes or appending `\x1b[0m`, while keeping `$param$` interpolation and unknown `|nope|` tokens intact.

```ts
it("applies the bold style token alongside bright colors", () => {
  expect(
    generateTerminalMessage("|bold||bright_green|❯ coverage|reset|", {}),
  ).toBe("\x1b[1m\x1b[92m❯ coverage\x1b[0m");
});

it("strips known style and color tokens without emitting ANSI codes when color is false", () => {
  expect(
    generateTerminalMessage(
      "|bold||bright_green|❯ $name$|reset| |nope|",
      { name: "coverage" },
      { color: false },
    ),
  ).toBe("❯ coverage |nope|");
});
```

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `npx vitest run src/generateTerminalMessage/generateTerminalMessage.test.ts`
Expected: FAIL because `bold` is not in `COLOR_CODES` and `{ color: false }` is not supported yet.

- [ ] **Step 3: Implement minimal changes in `generateTerminalMessage.ts`**

Add `bold: "\x1b[1m"` to `COLOR_CODES`, add `_stripColors(message: string): string` (removing only tokens present in `COLOR_CODES`), and accept optional `options: Readonly<{ color?: boolean }> = {}` with `const isColorEnabled = options.color ?? true;`. When `!isColorEnabled`, interpolate params and strip known tokens without appending `|reset|`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/generateTerminalMessage/generateTerminalMessage.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/generateTerminalMessage/generateTerminalMessage.ts src/generateTerminalMessage/generateTerminalMessage.test.ts
git commit -m "feat: add bold token and plain-mode color option to generateTerminalMessage"
```

---

### Task 2: Add `terminalSession` Types, `isColorEnabledForStream`, and `openTerminalSession`

**Files:**

- Create: `src/terminalSession/terminalSession.types.ts`
- Create: `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.ts`
- Create: `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`
- Create: `src/terminalSession/openTerminalSession/openTerminalSession.ts`
- Create: `src/terminalSession/openTerminalSession/openTerminalSession.test.ts`

- [ ] **Step 1: Write `src/terminalSession/terminalSession.types.ts`**

Define `TerminalInputStream`, `TerminalOutputStream`, `TerminalSession`, and `TerminalSessionOptions` (mutable type aliases; callers apply `Readonly<>` at function boundaries).

- [ ] **Step 2: Write failing tests for `isColorEnabledForStream` and `openTerminalSession`**

In `isColorEnabledForStream.test.ts`:

- Returns `true` when `stream.isTTY === true`, `NO_COLOR` is unset or `""`, and `TERM` is `"xterm-256color"`.
- Returns `false` when `stream.isTTY` is `false` or `undefined`.
- Returns `false` when `NO_COLOR` is nonempty (`"1"` or `"true"`).
- Returns `false` when `TERM === "dumb"`.

In `openTerminalSession.test.ts`:

- Returns `undefined` immediately when `interactive: false` without calling `openTty`.
- Returns a non-owning wrapper around an injected `session` whose `close()` does not close the caller's session.
- Returns `undefined` when `CI="true"` or `CI="1"` and `interactive` is not explicitly `true`.
- Returns `undefined` when none of `stdin`/`stdout`/`stderr` has `isTTY === true`, without calling `openTty` (prevents hijacking parent `/dev/tty` in piped/agent subprocesses).
- Calls `openTty` when `stdin` and `stdout` are piped (`isTTY: false`) but `stderr.isTTY === true`, returning the `/dev/tty` session.
- Falls back to `{ input: stdin, output: stderr }` when `openTty` returns `undefined` AND both `stdin.isTTY === true` and `stderr.isTTY === true`, restoring `setRawMode(false)` and calling `pause()` on `close()` without destroying `stdin` or `stderr`.
- Returns `undefined` when `openTty` returns `undefined` and `stdin.isTTY` is `false` (never falls back to piped `stdin`).
- Returns `undefined` when `openTty` returns `undefined` and `stderr.isTTY` is `false` (never falls back to `stdout`).
- Marks `isRawModeSupported: false` when `TERM === "dumb"`.

- [ ] **Step 3: Run targeted tests to verify they fail**

Run: `npx vitest run src/terminalSession/`
Expected: FAIL because implementation modules do not exist yet.

- [ ] **Step 4: Implement `isColorEnabledForStream.ts` and `openTerminalSession.ts`**

In `openTerminalSession.ts`:

- Default `/dev/tty` opener (`_openPosixTtySession`) runs when `platform !== "win32"`: opens `/dev/tty` twice using promisified `node:fs` `open` (`constants.O_RDONLY` and `constants.O_WRONLY`), wraps descriptors in `new tty.ReadStream(inputFd)` and `new tty.WriteStream(outputFd)`, closes any unwrapped fd on error, computes `isColorEnabled` via `isColorEnabledForStream`, sets `isRawModeSupported: env.TERM !== "dumb"`, and provides `close()` that restores `setRawMode(false)` if raw, pauses, and destroys both streams cleanly.
- Catch expected `/dev/tty` open errors (`ENXIO`, `ENOENT`, `EACCES`, `ENODEV`, etc.) and return `undefined` so fallback runs.

- [ ] **Step 5: Run targeted tests to verify they pass**

Run: `npx vitest run src/terminalSession/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/terminalSession/
git commit -m "feat: add controlling-terminal session opener and TTY color detection"
```

---

### Task 3: Add `CLIError` Interactive Codes, Hint Preservation, and Color-Aware `formatCLIError`

**Files:**

- Modify: `src/CLIError.ts`
- Modify: `src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts`
- Modify: `src/AcclimateCLI/formatCLIError/formatCLIError.ts`
- Modify: `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
- Modify: `src/AcclimateCLI/createCLI/createCLI.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/AcclimateCLI/createCLI/createCLI.test.ts`:

- `CLIError.promptCancelled({ cliName: "demo" })` creates a `CLIError` with `code: "prompt_cancelled"` and a clear cancellation message.
- `CLIError.interactiveInputUnavailable({ cliName: "demo", message: "..." })` creates a `CLIError` with `code: "interactive_input_unavailable"`.
- `CLIError.missingRequiredOption({ cliName, optionName, hint })` and `CLIError.missingRequiredPositionalArg({ cliName, positionalArgName, hint })` preserve custom `hint`.

In `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`:

- `formatCLIError(error, { color: false })` renders plain text with emoji (`❌`, `⚠️`) and zero ANSI escape codes (`\x1b`).

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement changes**

- Update `src/CLIError.ts`:
  - Add `{ code: "prompt_cancelled"; details: undefined }` and `{ code: "interactive_input_unavailable"; details: undefined }` to `CLIErrorInfo`.
  - Add static `CLIError.promptCancelled` and `CLIError.interactiveInputUnavailable`.
  - Accept optional `hint?: string` in `CLIError.missingRequiredOption` and `CLIError.missingRequiredPositionalArg`.
  - Update `withHelpContext` to accept optional `hint?: string` and `usage?: string` so `prompt_cancelled` can carry `commandPath` without attaching a large usage block.
- Update `src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts`:
  - If `options.error.code === "prompt_cancelled"`, attach only `commandPath` (no hint/usage wall).
  - Otherwise preserve `options.error.hint` if already set, falling back to `Run ${commandLabel} --help to see available options and usage.`.
- Update `src/AcclimateCLI/formatCLIError/formatCLIError.ts`:
  - Accept optional `options?: Readonly<{ color?: boolean }>` and pass it to `generateTerminalMessage`.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CLIError.ts src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts src/AcclimateCLI/formatCLIError/formatCLIError.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts src/AcclimateCLI/createCLI/createCLI.test.ts
git commit -m "feat: add prompt cancellation and unattended error codes to CLIError"
```

---

### Task 4: Build `requestChoiceMenu` (`MenuNavigation`, `renderChoiceMenu`, and `requestChoiceMenu`)

**Files:**

- Create: `src/requestChoiceMenu/requestChoiceMenu.types.ts`
- Create: `src/requestChoiceMenu/MenuNavigation/MenuNavigation.ts`
- Create: `src/requestChoiceMenu/MenuNavigation/MenuNavigation.test.ts`
- Create: `src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.ts`
- Create: `src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.test.ts`
- Create: `src/requestChoiceMenu/requestChoiceMenu.ts`
- Create: `src/requestChoiceMenu/requestChoiceMenu.test.ts`

- [ ] **Step 1: Write `src/requestChoiceMenu/requestChoiceMenu.types.ts`**

Define `ChoiceMenuItem<TValue>` and `ChoiceMenuOptions<TValue>`.

- [ ] **Step 2: Write failing tests for `MenuNavigation`, `renderChoiceMenu`, and `requestChoiceMenu`**

In `MenuNavigation.test.ts`:

- Parses Up (`\x1b[A`, `\x1bOA`), Down (`\x1b[B`, `\x1bOB`), `j`, `k`, `g`, `G`, Home (`\x1b[H`, `\x1bOH`), End (`\x1b[F`, `\x1bOF`), digits `1`-`9`, Enter (`\r`, `\n`), Ctrl-C (`\x03`), Ctrl-D (`\x04`), and ignores unrecognized letters (`x`, `z`).
- Buffers split escape sequences across chunks (`"\x1b"` followed by `"[B"` produces `"down"`).
- Parses multi-key buffered chunks (`"jj\r"` -> `["down", "down", "confirm"]`).
- Wraps `down` / `j` from last index to `0` and `up` / `k` from `0` to `numChoices - 1`.
- Jumps to `0` on `first` (`g`) and `numChoices - 1` on `last` (`G`).
- Keeps out-of-range digits unchanged.

In `renderChoiceMenu.test.ts`:

- Highlights the active item in bold green (`\x1b[1m\x1b[92m`) with textual cursor `❯`, and indents unselected items with two spaces.
- Renders optional item descriptions and `(default)` badges.
- Emits zero ANSI escape codes in plain mode (`isColorEnabled: false`) while preserving `❯` cursor, labels, descriptions, and default markers.

In `requestChoiceMenu.test.ts`:

- Navigates with Down/Up arrows and `j`/`k` (wrapping in both directions) and confirms with Enter.
- Jumps with `g` (first) and `G` (last) and confirms with Enter.
- Starts highlighted on `defaultValue` when provided.
- Restores raw mode (`setRawMode(false)`), restores cursor visibility (`\x1b[?25h`), removes `data` listeners, and emits confirmation summary to `session.output` (never `process.stdout`).
- Cancels on Ctrl-C (`\x03`) with `CLIError` (`code: "prompt_cancelled"`), restoring raw mode (`setRawMode(false)`), cursor visibility, and listeners.
- Cancels on Ctrl-D (`\x04`) and stream EOF (`end`) with `CLIError` (`code: "prompt_cancelled"`), restoring raw mode and listeners.
- Handles non-raw fallback (`isRawModeSupported: false`): renders numbered plain menu without ANSI cursor controls, rejects invalid input and re-prompts without silently accepting a previous selection, accepts valid index or value, and cancels on EOF.
- Throws `CLIError` (`code: "interactive_input_unavailable"`) when `interactive: false` or no TTY is available.
- Throws an `Error` when `choices` is empty.

- [ ] **Step 3: Run targeted tests to verify they fail**

Run: `npx vitest run src/requestChoiceMenu/`
Expected: FAIL.

- [ ] **Step 4: Implement `MenuNavigation`, `renderChoiceMenu`, and `requestChoiceMenu`**

Keep every function concise (<= 45 lines) and every file well under 400 lines. Use functional transforms for rendering lines and scanning chunks.

- [ ] **Step 5: Run targeted tests to verify they pass**

Run: `npx vitest run src/requestChoiceMenu/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/requestChoiceMenu/
git commit -m "feat: add interactive choice menu with arrow/j/k/g/G navigation and raw-mode cleanup"
```

---

### Task 5: Migrate `requestTerminalInput` to `TerminalSession`, Choice/Boolean Delegation, Cancellation, and Unattended Fallback

**Files:**

- Modify: `src/requestTerminalInput/requestTerminalInput.ts`
- Modify: `src/requestTerminalInput/requestTerminalInput.test.ts`

- [ ] **Step 1: Write failing tests in `src/requestTerminalInput/requestTerminalInput.test.ts`**

Test observable behavior using an injected in-memory `TerminalSession` (no `node:readline/promises` mock needed — test real `readline/promises` over `PassThrough` streams!):

- Writes prompt and optional notice to `session.output` and keeps `process.stdout` untouched, returning entered text.
- Returns `undefined` when optional input is submitted blank.
- Returns stringified `defaultValue` when blank and `defaultValue` is set.
- Re-prompts on `session.output` (never `process.stdout`) when required input is submitted blank.
- Re-prompts on `session.output` when `type: "number"` receives non-numeric input (`"abc"` then `"42"`).
- Delegates `choices` to the interactive choice menu (arrow/`j`/`k`/`g`/`G` + Enter) and returns the selected string value.
- Delegates `type: "boolean"` to a `Yes` / `No` choice menu when `session.isRawModeSupported` is `true`, and validates `(y/n)` text input on `session.output` when `session.isRawModeSupported` is `false`.
- Rejects with `CLIError` (`code: "prompt_cancelled"`) on EOF / stream close or Ctrl-C without hanging.
- In unattended mode (`interactive: false` or no TTY): returns stringified `defaultValue` (or `undefined`) when `!required`, and rejects promptly with `CLIError` (`code: "interactive_input_unavailable"`) when `required: true`.

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `npx vitest run src/requestTerminalInput/requestTerminalInput.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement updated `src/requestTerminalInput/requestTerminalInput.ts`**

- Open or reuse a `TerminalSession` via `openTerminalSession`.
- Handle unattended fallback cleanly without hanging.
- Delegate `choices` (and `type: "boolean"` when raw mode supported) to `requestChoiceMenu`.
- Use real `node:readline/promises` bound strictly to `{ input: session.input, output: session.output }` with async recursive `_promptLineUntilValid` (no `while` loop), number validation, custom `validate` hook, and `SIGINT`/EOF/`AbortError` -> `CLIError.promptCancelled`.
- Always close `rl` and the locally opened `TerminalSession` in `finally`.

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `npx vitest run src/requestTerminalInput/requestTerminalInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/requestTerminalInput/requestTerminalInput.ts src/requestTerminalInput/requestTerminalInput.test.ts
git commit -m "feat: route requestTerminalInput through TerminalSession with menus and unattended fallback"
```

---

### Task 6: Recognize Built-In `--no-prompt` in `tokenizeCLIInput`

**Files:**

- Create: `src/AcclimateCLI/runCLI/tokenizeCLIInput/cliOptionLookupHelpers.ts` (extract small lookup/classification helpers so `tokenizeCLIInput.ts` stays well under 400 lines)
- Modify: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`
- Create: `src/AcclimateCLI/runCLI/tokenizeCLIInput/__tests__/tokenizeCLIInput.noPrompt.test.ts`

- [ ] **Step 1: Write failing tests in `tokenizeCLIInput.noPrompt.test.ts`**

Test:

- Built-in `--no-prompt` sets `isNoPromptRequested: true` without throwing `unknown_option` and without adding `--no-prompt` to `rawOptionArgs`.
- `--no-prompt=false` sets `isNoPromptRequested: false`; `--no-prompt=true` sets `isNoPromptRequested: true`.
- Built-in `--no-prompt` before a subcommand propagates `isNoPromptRequested: true` into the delegated subcommand result.
- When a CLI explicitly registers `--no-prompt`, the value is recorded in `rawOptionArgs` (or `rawGlobalOptionArgs`) AND `isNoPromptRequested` reflects `rawValue !== "false"`.
- `--no-prompt` after `--` is passed verbatim as a positional argument with `isNoPromptRequested: false`.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/__tests__/`
Expected: FAIL on `tokenizeCLIInput.noPrompt.test.ts`.

- [ ] **Step 3: Implement helper extraction and built-in `--no-prompt` support**

- Extract pure token/option lookup helpers to `cliOptionLookupHelpers.ts` (`isOptionLikeToken`, `isNegativeNumberToken`, `splitInlineOptionToken`, `findOptionEntry`, `isBuiltinHelpFlag`, `mergeParentGlobalOptions`).
- Update `tokenizeCLIInput.ts` to track `isNoPromptRequested` on `TokenScanState` and `TokenizedCLIInput`, propagate `inheritedNoPrompt` across subcommand delegation, handle built-in `--no-prompt` / `--no-prompt=true` / `--no-prompt=false`, and mirror explicitly declared `--no-prompt` options into `isNoPromptRequested`.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/__tests__/`
Expected: PASS (all three test files green).

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/tokenizeCLIInput/
git commit -m "feat: recognize built-in --no-prompt flag in tokenizeCLIInput"
```

---

### Task 7: Add `promptCLIParam` and Wire Interactive Menus, Bare Multi-Command Menu, and Unattended Fallback in `runCLI`

**Files:**

- Create: `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.ts`
- Create: `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.test.ts`
- Modify: `src/AcclimateCLI/runCLI/runCLI.ts`
- Modify: `src/AcclimateCLI/runCLI/__tests__/runCLI.options.test.ts`
- Modify: `src/AcclimateCLI/runCLI/__tests__/runCLI.positional.test.ts`
- Modify: `src/AcclimateCLI/runCLI/__tests__/runCLI.variadic.test.ts`
- Create: `src/AcclimateCLI/runCLI/__tests__/runCLI.interactive.test.ts`

- [ ] **Step 1: Write failing tests for `promptCLIParam` and `runCLI.interactive.test.ts`**

In `promptCLIParam.test.ts`:

- Prompts with `requestChoiceMenu` when `choices` is configured and returns the chosen string value.
- Prompts with `Yes`/`No` `requestChoiceMenu` when `type === "boolean"` on a raw-capable TTY.
- Prompts with `requestTerminalInput` for free-text `string`/`number`.
- When unattended (`terminal === undefined`):
  - Throws `CLIError` (`missing_required_option`) naming `--flag` and example invocation for a missing required option with `askIfEmpty`.
  - Throws `CLIError` (`missing_required_positional_arg`) naming `<arg>` and example invocation for a missing required positional arg with `askIfEmpty`.
  - Returns `undefined` (letting defaults apply) for an optional `askIfEmpty` param.

In `runCLI.interactive.test.ts`:

- Opens a choice menu for an `askIfEmpty` option with `choices`, supports `j`/`k`/`g`/`G`/arrows + Enter, and passes the selected value to `.action()`.
- Opens a `Yes`/`No` choice menu for an `askIfEmpty` boolean option and passes `true`/`false` to `.action()`.
- Opens a bare multi-command action menu when an actionless parent CLI with subcommands runs bare on an interactive terminal, carries forward root global options (`--verbose`), recurses into nested subcommand groups, runs the selected command's `askIfEmpty` prompts, closes the terminal session BEFORE `.action()` executes, and leaves `stdout` completely clean for JSON output!
- Cancelling any menu or prompt with `Ctrl-C` or `EOF` rejects with `CLIError` (`code: "prompt_cancelled"`), restores raw mode, prevents subsequent prompts, and never invokes `.action()`.
- Unattended mode (no TTY, `CI=true`, `interactive: false`, or `--no-prompt`):
  - Fails promptly without opening `/dev/tty` when a required `askIfEmpty` option or positional arg is missing, with a `CLIError` message and recovery hint naming the flag/arg and invocation.
  - Falls back to `defaultValue` (or `[]` / `undefined`) for optional `askIfEmpty` parameters without opening `/dev/tty`.
- Never opens `/dev/tty` (`openTty` called 0 times) when all required values are supplied on the command line.
- Keeps piped `stdin` completely untouched and `stdout` strictly valid JSON even when interactive menus run via `/dev/tty`.

Update the legacy `askIfEmpty` tests in `runCLI.options.test.ts`, `runCLI.positional.test.ts`, and `runCLI.variadic.test.ts` to inject an interactive in-memory `TerminalSession` (removing the old `vi.mock("node:readline/promises")` and `process.stdout.write` assertions) and assert that `stdout` stays empty during prompting!

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npx vitest run src/AcclimateCLI/runCLI/`
Expected: FAIL.

- [ ] **Step 3: Implement `promptCLIParam.ts` and update `runCLI.ts`**

- Implement `promptCLIParam.ts` handling interactive choice/boolean/text prompting and unattended error construction with actionable flag/invocation hints.
- Update `runCLI.ts` to:
  - Accept optional `stdin`, `stderr`, `env`, `terminal`, `interactive`, `openTty`.
  - Create a lazy single-session controller (`_createLazyTerminalController`) respecting `options.interactive` and `tokenized.isNoPromptRequested`.
  - Handle bare actionless parent/group commands with registered subcommands by opening an interactive subcommand choice menu (sorted alphabetically with descriptions), merging parent global options, carrying forward `rawGlobalOptionArgs`, and recursively running the selected subcommand.
  - Close any opened terminal session in `finally` BEFORE calling `await targetState.action(parsedArgs)` so command actions run in cooked terminal mode with no open `/dev/tty` fd.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/
git commit -m "feat: add interactive menus, bare command selector, and unattended fallback to runCLI"
```

---

### Task 8: Enforce Stream Separation in `Acclimate`, `executeCLI`, and Public Exports (`src/index.ts`)

**Files:**

- Modify: `src/Acclimate.ts`
- Modify: `src/AcclimateCLI/executeCLI/executeCLI.ts`
- Modify: `src/AcclimateCLI/executeCLI/executeCLI.test.ts`
- Create: `src/__tests__/acclimateStreams.integration.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests**

In `src/__tests__/acclimateStreams.integration.test.ts`:

- `Acclimate.log` writes formatted messages to `stderr` (not `stdout`), strips ANSI tokens when `stderr` is non-TTY or `NO_COLOR=1`, and emits ANSI codes when `stderr.isTTY === true` and `NO_COLOR` is unset.
- `Acclimate.writeData` writes clean newline-terminated text to `stdout` without touching `stderr`.
- `Acclimate.writeJson` writes parseable JSON to `stdout` (compact by default, indented with `pretty: true`) without touching `stderr`.
- `Acclimate.requestChoice` delegates to `requestChoiceMenu` over an injected `TerminalSession`.

In `src/AcclimateCLI/executeCLI/executeCLI.test.ts`:

- Unit test: `executeCLI` returns exit code `130` and calls `onExitCode(130)` when a menu is cancelled via Ctrl-C, writes a concise cancellation message to `stderr` (without dumping full usage), leaves `stdout` empty, and does not run the action.
- Unit test: `executeCLI` honors `--no-prompt` even when an interactive `terminal` is supplied, failing fast with exit code `1` and an actionable flag hint on `stderr` and empty `stdout`.
- Subprocess test: real `Acclimate.run(cli)` with `Acclimate.log(...)` + `Acclimate.writeJson(...)` emits clean `JSON.parse`-able `stdout` while diagnostics go strictly to `stderr` with exit `0`.
- Subprocess test: real `Acclimate.run(cli)` with a required `askIfEmpty` option in a non-TTY subprocess fails immediately (never hangs!), exits `1`, writes the missing-flag error and invocation hint to `stderr`, and leaves `stdout` empty.
- Subprocess test: real `Acclimate.run(cli)` with an optional `askIfEmpty` option with `defaultValue` in a non-TTY subprocess uses the default, emits clean JSON to `stdout`, and exits `0`.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `npx vitest run src/__tests__/acclimateStreams.integration.test.ts src/AcclimateCLI/executeCLI/executeCLI.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement updates in `Acclimate.ts`, `executeCLI.ts`, and `src/index.ts`**

- Update `src/Acclimate.ts`:
  - `log` writes to `options?.stream ?? process.stderr` with `color: options?.color ?? isColorEnabledForStream({ stream })`.
  - Add `writeData`, `writeJson`, `requestChoice`.
  - Update `requestInput` signature to accept optional `choices`, `validate`, `terminal`, `interactive`, `cliName`.
  - Pass `stdin`, `stdout`, `stderr`, `env`, and `onExitCode` in `Acclimate.run`.
- Update `src/AcclimateCLI/executeCLI/executeCLI.ts`:
  - Accept optional `stdin`, `env`, `terminal`, `interactive`, `openTty` and forward to `runCLI`.
  - Format `CLIError` with `{ color: isColorEnabledForStream({ stream: stderr, env }) }`.
  - Map `prompt_cancelled` to exit code `130` and all other errors to `1`.
- Update `src/index.ts` to export `requestChoiceMenu`, `requestTerminalInput`, `openTerminalSession`, `isColorEnabledForStream`, and the new types (`ChoiceMenuItem`, `ChoiceMenuOptions`, `TerminalInputStream`, `TerminalOutputStream`, `TerminalSession`, `TerminalSessionOptions`).

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx vitest run src/__tests__/acclimateStreams.integration.test.ts src/AcclimateCLI/executeCLI/executeCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Acclimate.ts src/AcclimateCLI/executeCLI/executeCLI.ts src/AcclimateCLI/executeCLI/executeCLI.test.ts src/__tests__/acclimateStreams.integration.test.ts src/index.ts
git commit -m "feat: enforce stdout/stderr stream separation and wire interactive exit handling"
```

---

### Task 9: Update Documentation and Run Full Verification Gate

**Files:**

- Create: `docs/interactive-prompts.md`
- Modify: `docs/argument-parsing.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/interactive-prompts.md` and update `docs/argument-parsing.md` and `README.md`**

Document:

- Controlling-terminal (`/dev/tty`) session model, attached-TTY guard, `stdin`/`stderr` fallback, and `NO_COLOR`/`TERM=dumb` handling.
- Choice menu controls (`Up`/`Down`, `j`/`k` wrapping, `g`/`G`, `Home`/`End`, `1`-`9`, `Enter`, `Ctrl-C`/`EOF` cancellation + exit code `130`), automatic menus for `choices`, `boolean`, and bare actionless multi-command CLIs.
- Unattended mode (`--no-prompt`, `CI`, non-TTY), actionable missing-required errors, and optional defaults.
- Strict stream separation (`stdout` for data / `Acclimate.writeData` / `Acclimate.writeJson` and explicit `--help`; `stderr` for `Acclimate.log` and errors; `/dev/tty` for interactive prompts).
- Updated public exports in `README.md`.

- [ ] **Step 2: Run formatting and full verification gate**

Run:

```bash
npm run format && npm run type && npm run lint && npm test && npm run build
```

Expected: All four checks pass with 0 errors and clean build artifacts in `dist/`.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/interactive-prompts.md docs/argument-parsing.md README.md
git commit -m "docs: document interactive menus, /dev/tty IO, unattended mode, and stream separation"
```
