# First-Class Help Handling & Unknown-Flag Error Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add built-in `-h`/`--help` handling before validation, prompting, or action execution at root and every subcommand level, enrich generated help text (synopsis, choices, examples, built-in help flag, inherited globals, command path), and fail nonzero with clear error message, recovery hint, and usage on `stderr` for unknown flags and CLI usage errors.

**Architecture:** Extend `CLIError` with optional help context (`cliName`, `commandPath`, `hint`, `usage`, `withHelpContext`), add `.usage()` and `.addExample()` to `IAcclimateCLI`, expand `generateHelpText` to render complete command usage, detect `-h`/`--help` with precedence over errors in `tokenizeCLIInput`, short-circuit help output to injectable `stdout` in `runCLI`, and introduce pure `formatCLIError` plus `executeCLI` wired into `Acclimate.run` so CLI errors write cleanly to `stderr` and set `process.exitCode = 1` without a stack trace.

**Tech Stack:** TypeScript 5.9 (ESM, strict mode, `verbatimModuleSyntax`), Node.js >= 18, Vitest 2, ESLint 9, Prettier 3, `tsup`, `change-case`, `ts-pattern`, `type-fest`.

---

## File Map

- **Modify:** `src/CLIError.ts` - Store raw detail message, expose `cliName`, `commandPath`, `hint`, `usage`, clearer `Unknown option` default message, and immutable `withHelpContext(...)`.
- **Modify:** `src/AcclimateCLI/CLIParam.types.ts` - Add `CLIExample` and `OutputStream` types.
- **Modify:** `src/AcclimateCLI/AcclimateCLI.types.ts` - Add `usage`, `examples`, `.usage()`, `.addExample()`, re-export `CLIExample` / `OutputStream`, widen action return type to `void | Promise<void>`.
- **Modify:** `src/AcclimateCLI/AcclimateCLI.ts` - Implement immutable `.usage()` and `.addExample()`.
- **Modify:** `src/AcclimateCLI/createCLI/defaultCLIState.ts` - Initialize `usage: undefined` and `examples: []`.
- **Modify:** `src/AcclimateCLI/createCLI/createCLI.test.ts` - Unit tests for `CLIError.withHelpContext`, `.usage()`, and `.addExample()`.
- **Modify:** `src/AcclimateCLI/generateHelpText/generateHelpText.ts` - Render `Usage` synopsis (auto-generated or custom), `choices`, `Examples`, built-in `--help, -h` (with collision awareness), and `commandPath`.
- **Modify:** `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts` - Update existing assertions and add tests for synopsis, choices, examples, collision handling, and `commandPath`.
- **Create:** `src/AcclimateCLI/formatCLIError/formatCLIError.ts` - Pure formatter producing red error line, indented yellow `⚠️` recovery hint, and usage block.
- **Create:** `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts` - Unit tests for `formatCLIError`.
- **Modify:** `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts` - Track `commandPath`, detect built-in `-h`/`--help` with precedence over deferred `scanError` and `pendingOption`, respect `--` and explicit user flags, attach help context to tokenization errors.
- **Modify:** `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts` - Unit tests for help detection, precedence, `--`, collisions, `commandPath`, and unknown-flag context.
- **Modify:** `src/AcclimateCLI/runCLI/runCLI.ts` - Short-circuit `isHelpRequested` to injectable `stdout`, attach help context to parsing/validation `CLIError`s, await async actions.
- **Create:** `src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts` - End-to-end tests proving `-h`/`--help` prints complete help to `stdout` with zero side effects (no actions, prompts, or required checks).
- **Create:** `src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts` - Tests proving unknown flags and parse/validation failures reject with enriched `CLIError` carrying `commandPath`, `hint`, and `usage`.
- **Create:** `src/AcclimateCLI/executeCLI/executeCLI.ts` - Stream-injectable boundary returning exit code (`0` / `1`), writing `CLIError` via `formatCLIError` to `stderr`, and invoking `onExitCode`.
- **Create:** `src/AcclimateCLI/executeCLI/executeCLI.test.ts` - Unit tests and real subprocess tests verifying exit code `0`/`1` and `stdout`/`stderr` isolation via `Acclimate.run`.
- **Modify:** `src/Acclimate.ts` - Wire `Acclimate.run(cli)` through `executeCLI`.
- **Modify:** `src/index.ts` - Export `CLIExample`, `OutputStream`, `generateHelpText`, and `executeCLI`.
- **Modify:** `docs/argument-parsing.md` - Document `-h`/`--help` precedence, `.usage()`, `.addExample()`, stderr error format, and exit codes.
- **Modify:** `README.md` - Document built-in help, command metadata, unknown-flag failure behavior, and new exports.

---

### Task 1: Enrich `CLIError` with help context and `withHelpContext`

**Files:**

- Modify: `src/CLIError.ts`
- Modify: `src/AcclimateCLI/createCLI/createCLI.test.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/createCLI/createCLI.test.ts`**

Add tests inside the `describe("CLIError", ...)` block verifying:

1. `CLIError.unknownOption` uses the clear `Unknown option "<flag>"` message and exposes `cliName`.
2. `error.withHelpContext({ commandPath, hint, usage })` returns a new `CLIError` preserving `code`, updating `cliName` to `commandPath.join(" ")`, avoiding double-prefixing `❌ Error running`, populating `commandPath`/`hint`/`usage`, and leaving the original error unchanged.

```ts
it("formats unknownOption with a clear message and cliName", () => {
  const error = CLIError.unknownOption({
    cliName: "avandar-lint coverage",
    optionName: "--bogus",
  });

  expect(error.code).toBe("unknown_option");
  expect(error.cliName).toBe("avandar-lint coverage");
  expect(error.message).toBe(
    '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
  );
});

it("attaches commandPath, hint, and usage immutably via withHelpContext", () => {
  const original = CLIError.unknownOption({
    cliName: "coverage",
    optionName: "--bogus",
  });

  const enriched = original.withHelpContext({
    commandPath: ["avandar-lint", "coverage"],
    hint: "Run avandar-lint coverage --help to see available options and usage.",
    usage: "avandar-lint coverage\n\nUsage\n  avandar-lint coverage [options]",
  });

  expect(enriched).toBeInstanceOf(CLIError);
  expect(enriched).not.toBe(original);
  expect(enriched.code).toBe("unknown_option");
  expect(enriched.cliName).toBe("avandar-lint coverage");
  expect(enriched.message).toBe(
    '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
  );
  expect(enriched.commandPath).toEqual(["avandar-lint", "coverage"]);
  expect(enriched.hint).toBe(
    "Run avandar-lint coverage --help to see available options and usage.",
  );
  expect(enriched.usage).toContain("avandar-lint coverage [options]");
  expect(original.hint).toBeUndefined();
  expect(original.usage).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: FAIL (`cliName` and `withHelpContext` do not exist on `CLIError`).

- [ ] **Step 3: Implement help context fields and `withHelpContext` in `src/CLIError.ts`**

Update `CLIErrorOptions` to accept optional `commandPath?: readonly string[]`, `hint?: string`, and `usage?: string`. Store `readonly code`, `readonly cliName`, `readonly commandPath`, `readonly hint`, `readonly usage`, plus private `_rawMessage` and `_details` (or `_errorInfo: CLIErrorInfo`) so `withHelpContext` reconstructs a clean `CLIError` without double-prefixing. Update `CLIError.unknownOption` default message to `Unknown option "${options.optionName}"`.

```ts
type CLIErrorHelpContext = {
  commandPath: readonly string[];
  hint: string;
  usage: string;
};

type CLIErrorOptions = {
  cliName: string;
  message: string;
  commandPath?: readonly string[];
  hint?: string;
  usage?: string;
} & CLIErrorInfo;
```

In `CLIError`:

```ts
  /** Machine-readable code identifying the CLI failure category. */
  readonly code: CLIErrorCode;

  /** Display name or invocation path of the CLI that failed. */
  readonly cliName: string;

  /** Invocation token path leading to the failing command, when known. */
  readonly commandPath: string[] | undefined;

  /** Actionable recovery hint for stderr output, when available. */
  readonly hint: string | undefined;

  /** Rendered usage text for the failing command, when available. */
  readonly usage: string | undefined;

  private readonly _rawMessage: string;
  private readonly _errorInfo: CLIErrorInfo;
```

```ts
  /**
   * Return a copy of this error with command path, recovery hint, and usage
   * context attached for user-facing stderr rendering.
   */
  withHelpContext(context: Readonly<CLIErrorHelpContext>): CLIError {
    const commandLabel = context.commandPath.join(" ");
    return new CLIError({
      ...this._errorInfo,
      cliName: commandLabel || this.cliName,
      message: this._rawMessage,
      commandPath: [...context.commandPath],
      hint: context.hint,
      usage: context.usage,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CLIError.ts src/AcclimateCLI/createCLI/createCLI.test.ts
git commit -m "feat: add help context metadata and withHelpContext to CLIError"
```

---

### Task 2: Add `.usage()`, `.addExample()`, `CLIExample`, and `OutputStream` to builder & types

**Files:**

- Modify: `src/AcclimateCLI/CLIParam.types.ts`
- Modify: `src/AcclimateCLI/AcclimateCLI.types.ts`
- Modify: `src/AcclimateCLI/AcclimateCLI.ts`
- Modify: `src/AcclimateCLI/createCLI/defaultCLIState.ts`
- Modify: `src/AcclimateCLI/createCLI/createCLI.test.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/createCLI/createCLI.test.ts`**

Add a `describe("AcclimateCLI metadata builders", ...)` block testing:

1. `.usage("custom synopsis")` sets `state.usage` immutably without mutating the parent CLI.
2. `.addExample("cmd a")` and `.addExample({ command: "cmd b", description: "Run B" })` accumulate examples in order immutably.
3. Chaining `.usage()` and `.addExample()` preserves parameter type inference in `.action(...)`, including async actions.

```ts
describe("AcclimateCLI metadata builders", () => {
  it("stores custom usage text immutably without mutating the original CLI", () => {
    const baseCLI = createCLI("demo").description("Demo tool");
    const customCLI = baseCLI.usage("demo [files...] [options]");

    expect(baseCLI.state.usage).toBeUndefined();
    expect(customCLI.state.usage).toBe("demo [files...] [options]");
  });

  it("appends string and structured examples immutably in declaration order", () => {
    const baseCLI = createCLI("demo");
    const withOne = baseCLI.addExample("demo src/");
    const withTwo = withOne.addExample({
      command: "demo --format json src/",
      description: "Emit JSON output",
    });

    expect(baseCLI.state.examples).toEqual([]);
    expect(withOne.state.examples).toEqual(["demo src/"]);
    expect(withTwo.state.examples).toEqual([
      "demo src/",
      { command: "demo --format json src/", description: "Emit JSON output" },
    ]);
  });

  it("preserves argument type inference across usage, addExample, and async actions", () => {
    const cli = createCLI("demo")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .usage("demo [paths...]")
      .addExample("demo src/a.ts")
      .action(async (args) => {
        expectTypeOf(args.paths).toEqualTypeOf<string[]>();
        await Promise.resolve();
      });

    expect(cli.state.usage).toBe("demo [paths...]");
    expect(cli.state.examples).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: FAIL (`usage` and `addExample` are not functions on `IAcclimateCLI`).

- [ ] **Step 3: Implement types, default state, and builder methods**

In `src/AcclimateCLI/CLIParam.types.ts`, add:

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

/** Minimal writable output stream contract used for stdout/stderr injection. */
export type OutputStream = {
  write: (chunk: string) => unknown;
};
```

In `src/AcclimateCLI/AcclimateCLI.types.ts`:

- Re-export `CLIExample` and `OutputStream`.
- Add `usage?: string;` and `examples: readonly CLIExample[];` to `CLIState`.
- Widen `action` callback return type to `void | Promise<void>` in `CLIState` and `IAcclimateCLI`.
- Add `usage: (usage: string) => IAcclimateCLI<...>` and `addExample: (example: CLIExample) => IAcclimateCLI<...>` to `IAcclimateCLI`.

In `src/AcclimateCLI/createCLI/defaultCLIState.ts`:

- Add `usage: undefined,` and `examples: [],`.

In `src/AcclimateCLI/AcclimateCLI.ts`:

- Implement `usage` and `addExample`, and widen `action` return type to `void | Promise<void>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/CLIParam.types.ts src/AcclimateCLI/AcclimateCLI.types.ts src/AcclimateCLI/AcclimateCLI.ts src/AcclimateCLI/createCLI/defaultCLIState.ts src/AcclimateCLI/createCLI/createCLI.test.ts
git commit -m "feat: add usage and addExample metadata builders and async action typing"
```

---

### Task 3: Enhance `generateHelpText` with synopsis, choices, examples, built-in help option, and `commandPath`

**Files:**

- Modify: `src/AcclimateCLI/generateHelpText/generateHelpText.ts`
- Modify: `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`**

Update the existing snapshot-like assertions to reflect the new `Usage` synopsis and built-in `--help, -h` option, and add focused tests covering:

1. Auto-generated `Usage` synopsis for scalar required/optional, variadic required/optional, actionless `<command>`, action-bearing `[command]`, and `[options]`.
2. Custom `.usage(...)` override.
3. Full `commandPath` rendered in header and synopsis (e.g. `["avandar-lint", "coverage"]`).
4. `choices` rendered as `[choices: a | b | c]` on both options and positional arguments alongside `[default: ...]`.
5. Built-in `--help, -h` rendered at level 1, omitted when `--help` is explicitly declared, `-h` omitted from built-in help when `-h` is claimed by another option (e.g. `--host, -h`), and not repeated at level 2.
6. `Examples` section rendering both string examples and `{ command, description }` examples at level 1 only.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`
Expected: FAIL (missing `Usage`, built-in `--help, -h`, `choices`, `Examples`, and `commandPath` support).

- [ ] **Step 3: Implement complete help rendering in `src/AcclimateCLI/generateHelpText/generateHelpText.ts`**

Add focused pure helpers (each <= 45 lines):

- `_buildBuiltinHelpOption(state)`: checks whether `--help` is declared in `optionArgs`, `globalOptionArgs`, or `aliases`; if not, returns built-in help `HelpParam` with `aliases: ["-h"]` when `-h` is unclaimed, or `aliases: []` when `-h` is already registered.
- `_buildAutoSynopsis({ displayName, hasCommands, hasAction, positionalArgs, hasAnyOptions })`: builds `${displayName} ...` using `<command>` / `[command]`, `<arg>` / `[arg]` / `<arg...>` / `[arg...]`, and `[options]`.
- `_formatUsageSection(synopsis)`: renders `Usage` section.
- `_formatExamplesSection(examples)`: renders `Examples` section for strings and `{ command, description }`.
- Update `_formatParamLine` to include `[choices: ...]` (using `|` separator) and remove the stray redundant `|reset|` after `(${typeLabel})`.
- Accept optional second argument `options?: { commandPath?: readonly string[] }` on `generateHelpText`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/generateHelpText/generateHelpText.ts src/AcclimateCLI/generateHelpText/generateHelpText.test.ts
git commit -m "feat: render synopsis, choices, examples, and built-in help option in generateHelpText"
```

---

### Task 4: Add pure `formatCLIError` stderr formatter

**Files:**

- Create: `src/AcclimateCLI/formatCLIError/formatCLIError.ts`
- Create: `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`**

Test:

1. Formats error message in red, indented yellow `⚠️` recovery hint on the next line, blank line, and usage block when all fields are present.
2. Omits hint and usage cleanly when `CLIError` has neither (such as a builder config error).
3. Formats hint without trailing blank line when `usage` is absent.

```ts
import { describe, expect, it } from "vitest";
import { CLIError } from "@/CLIError";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { formatCLIError } from "./formatCLIError";

describe("formatCLIError", () => {
  it("renders red error, indented yellow recovery hint, and usage text", () => {
    const error = CLIError.unknownOption({
      cliName: "avandar-lint coverage",
      optionName: "--bogus",
    }).withHelpContext({
      commandPath: ["avandar-lint", "coverage"],
      hint: "Run avandar-lint coverage --help to see available options and usage.",
      usage: "USAGE BLOCK",
    });

    expect(formatCLIError(error)).toBe(
      [
        generateTerminalMessage(`|red|${error.message}|reset|`),
        generateTerminalMessage(
          "  |yellow|⚠️ Run avandar-lint coverage --help to see available options and usage.|reset|",
        ),
        "",
        "USAGE BLOCK",
      ].join("\n"),
    );
  });

  it("renders only the red error line when hint and usage are absent", () => {
    const error = CLIError.invalidPositionalArgConfig({
      cliName: "demo",
      positionalArgName: "paths",
    });

    expect(formatCLIError(error)).toBe(
      generateTerminalMessage(`|red|${error.message}|reset|`),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/AcclimateCLI/formatCLIError/formatCLIError.ts`**

```ts
import { generateTerminalMessage } from "@/generateTerminalMessage";
import type { CLIError } from "@/CLIError";

/**
 * Formats a `CLIError` for `stderr` output with a red error line, an indented
 * yellow recovery hint when available, and the failing command's usage text.
 */
export function formatCLIError(error: CLIError): string {
  const headerLines = [
    generateTerminalMessage(`|red|${error.message}|reset|`),
    error.hint !== undefined
      ? generateTerminalMessage(`  |yellow|⚠️ ${error.hint}|reset|`)
      : undefined,
  ].filter((line): line is string => {
    return line !== undefined;
  });

  if (error.usage === undefined) {
    return headerLines.join("\n");
  }

  return `${headerLines.join("\n")}\n\n${error.usage}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/formatCLIError/formatCLIError.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts
git commit -m "feat: add formatCLIError for stderr error, hint, and usage rendering"
```

---

### Task 5: Add `-h`/`--help` recognition, `commandPath`, and error context to `tokenizeCLIInput`

**Files:**

- Modify: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`
- Modify: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`**

Add tests covering:

1. Root `-h` and `--help` return `isHelpRequested: true` and `commandPath: ["avandar-lint"]`.
2. Subcommand and nested subcommand `-h`/`--help` (including with preceding global options) return `isHelpRequested: true`, merged global options on `targetCLI`, and full `commandPath` (e.g. `["root", "dev", "models", "new"]`).
3. Help takes precedence over unknown flags before or after (`["coverage", "--bogus", "--help"]`, `["coverage", "--help", "--bogus"]`) and over missing option value (`["coverage", "--format", "--help"]`).
4. `--help` before a subcommand (`["--help", "coverage"]`) targets the root CLI.
5. `-- -h` and `-- --help` pass as positional arguments with `isHelpRequested: false`.
6. `--format=--help` sets inline option value `"--help"` with `isHelpRequested: false`.
7. Explicit user `-h` alias (`--host, -h`) keeps `-h` mapped to `--host` while `--help` triggers built-in help; explicit user `--help` disables built-in help.
8. Unknown flags (`--unknown`, `-z`, `--unknown=val`) and missing option values throw `CLIError` populated with `commandPath`, `hint` (`Run <cmd> --help to see available options and usage.`), and `usage` (including inherited global options on subcommands).
9. Unknown flag before a subcommand name (`["--bogus", "coverage"]`) fails on the root CLI with `commandPath: ["avandar-lint"]` instead of descending.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`
Expected: FAIL (`isHelpRequested` and `commandPath` missing; `-h`/`--help` throws `unknown_option`).

- [ ] **Step 3: Implement help detection, `commandPath`, deferred `scanError`, and help context attachment in `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`**

Key helpers (each <= 45 lines):

- `_isBuiltinHelpFlag({ cli, token })`: returns `true` when `token === "--help"` and `--help` is unregistered on `cli`, OR `token === "-h"` and both `--help` and `-h` are unregistered on `cli`.
- `_attachHelpContext({ cli, commandPath, error })`: builds hint `Run ${commandPath.join(" ")} --help to see available options and usage.` and `usage: generateHelpText(cli, { commandPath })` via `error.withHelpContext(...)`.
- Update `TokenScanState` with `isHelpRequested: boolean` and `scanError: CLIError | undefined`.
- In `_stepToken`: short-circuit immediately when `state.delegatedResult || state.isHelpRequested`.
- In `_consumePendingOptionToken`: if `_isBuiltinHelpFlag({ cli, token })`, return `{ ...state, pendingOption: undefined, isHelpRequested: true }`; on missing value (`--` or flag-like), record `scanError` (keeping first error), clear `pendingOption`, and if `token === "--"` set `isAfterDoubleDash: true`.
- In `_consumeFlagToken`: if `_isBuiltinHelpFlag({ cli, token })`, return `{ ...state, isHelpRequested: true }`; on unknown flag, record `scanError` (keeping first error) instead of throwing immediately so a later `--help` before `--` still wins.
- In `_consumePositionalOrCommandToken`: require `!state.scanError` in `canMatchSubcommand`, and pass `commandPath: [...commandPath, token]` when recursing.
- At end of `tokenizeCLIInput`:
  1. If `finalState.delegatedResult`, return it.
  2. If `finalState.isHelpRequested`, return `{ targetCLI: cli, commandPath: [...commandPath], isHelpRequested: true, ... }`.
  3. If `finalState.scanError`, throw `finalState.scanError`.
  4. If `finalState.pendingOption`, throw `_attachHelpContext({ cli, commandPath, error: CLIError.missingOptionValue(...) })`.
  5. Return `{ targetCLI: cli, commandPath: [...commandPath], isHelpRequested: false, ... }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts
git commit -m "feat: detect built-in -h/--help with precedence and commandPath in tokenizeCLIInput"
```

---

### Task 6: Short-circuit help to `stdout` and attach error context in `runCLI`

**Files:**

- Modify: `src/AcclimateCLI/runCLI/runCLI.ts`
- Create: `src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts`
- Create: `src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts`

- [ ] **Step 1: Write failing tests in `runCLI.help.test.ts` and `runCLI.errors.test.ts`**

In `src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts`:

- Test root `--help` and `-h` write complete help (purpose, synopsis, subcommands, variadic positionals, options, global options, choices, defaults, examples) to injected `stdout`, resolve cleanly, and never run `action`, validation, or `askIfEmpty` prompts.
- Test subcommand and nested subcommand `--help` / `-h` (including with preceding global options) write subcommand help (with full command path and inherited global options) to injected `stdout` with zero side effects.
- Test `-- --help` passes `"--help"` as positional argument to `action` instead of printing help.
- Test actionless subcommand writes help with full `commandPath` to injected `stdout`.
- Test async `action` is awaited before `runCLI` resolves.

In `src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts`:

- Test unknown flag at root and subcommand rejects with `CLIError` (`unknown_option`) containing `commandPath`, `hint` (`Run <cmd> --help...`), and `usage` (including inherited global options), without calling `action` or `readline` prompts.
- Test missing required positional arg, missing required option, invalid choice, and too many positional args all reject with `CLIError` carrying `commandPath`, `hint`, and `usage` for the matched command.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts`
Expected: FAIL (`runCLI` does not accept `stdout`, does not short-circuit `isHelpRequested`, does not enrich post-tokenization `CLIError`s).

- [ ] **Step 3: Update `src/AcclimateCLI/runCLI/runCLI.ts`**

- Accept optional `stdout?: OutputStream` (defaulting to `process.stdout`) in `runCLI` options.
- After `tokenizeCLIInput`, if `isHelpRequested`, write `${generateHelpText(targetCLI, { commandPath })}\n` to `stdout` and return immediately.
- Wrap positional/option parsing in `try / catch`: if a `CLIError` is caught and lacks `usage` or `hint`, rethrow `error.withHelpContext({ commandPath, hint, usage })`.
- `await targetState.action(...)` when an action is configured.
- When no action is configured, write `${generateHelpText(targetCLI, { commandPath })}\n` to `stdout`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/__tests__/`
Expected: PASS across all `runCLI` suites (`commands`, `options`, `positional`, `variadic`, `help`, `errors`).

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/runCLI.ts src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts
git commit -m "feat: short-circuit -h/--help to stdout and enrich CLIError context in runCLI"
```

---

### Task 7: Add `executeCLI`, wire `Acclimate.run`, update `src/index.ts`, and verify subprocess behavior

**Files:**

- Create: `src/AcclimateCLI/executeCLI/executeCLI.ts`
- Create: `src/AcclimateCLI/executeCLI/executeCLI.test.ts`
- Modify: `src/Acclimate.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing tests in `src/AcclimateCLI/executeCLI/executeCLI.test.ts`**

Include both fast stream-injected unit tests AND real subprocess tests (using `node:child_process` `execFile` + `tsx`) exercising `Acclimate.run(cli)`:

1. Unit: `-h` and `--help` at root and subcommand write help to `stdout`, write nothing to `stderr`, return `0`, never invoke `onExitCode(1)` or `action`.
2. Unit: Unknown flag at root and subcommand writes red error + yellow `⚠️ Run <cmd> --help...` + command usage to `stderr`, leaves `stdout` completely empty, invokes `onExitCode(1)`, returns `1`, emits no stack trace, never runs `action`.
3. Unit: Missing required arg / invalid choice writes clean error + hint + usage to `stderr` and returns `1`.
4. Unit: Successful action returns `0` without calling `onExitCode`, preserving any exit code set by the action itself.
5. Unit: Unexpected non-`CLIError` thrown by action writes error details to `stderr`, invokes `onExitCode(1)`, and returns `1`.
6. Subprocess (`Acclimate.run(cli)`):
   - `--help` -> exit code `0`, help on `stdout`, empty `stderr`, action never ran.
   - `coverage -h` -> exit code `0`, `coverage` help with inherited globals + examples on `stdout`, empty `stderr`, action never ran.
   - `coverage --unknown` -> exit code `1`, error + `Run ... coverage --help` + usage on `stderr`, empty `stdout`, no stack trace, action never ran.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/executeCLI/executeCLI.test.ts`
Expected: FAIL (`executeCLI` does not exist yet).

- [ ] **Step 3: Implement `executeCLI`, update `src/Acclimate.ts`, and update `src/index.ts`**

In `src/AcclimateCLI/executeCLI/executeCLI.ts`:

```ts
import { CLIError } from "@/CLIError";
import { formatCLIError } from "../formatCLIError/formatCLIError";
import { runCLI } from "../runCLI/runCLI";
import type { AnyCLI, OutputStream } from "../AcclimateCLI.types";

type ExecuteCLIOptions = {
  cli: AnyCLI;
  input: readonly string[];
  stdout?: OutputStream;
  stderr?: OutputStream;
  onExitCode?: (exitCode: number) => void;
};

/**
 * Executes a CLI at a process boundary, writing help to `stdout`, rendering
 * `CLIError` messages with recovery hints and usage to `stderr`, and reporting
 * the resulting exit status (`0` on success/help, `1` on failure).
 */
export async function executeCLI(
  options: Readonly<ExecuteCLIOptions>,
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    await runCLI({ cli: options.cli, input: options.input, stdout });
    return 0;
  } catch (error) {
    const errorOutput =
      error instanceof CLIError
        ? formatCLIError(error)
        : error instanceof Error
          ? (error.stack ?? error.message)
          : String(error);
    stderr.write(`${errorOutput}\n`);
    options.onExitCode?.(1);
    return 1;
  }
}
```

In `src/Acclimate.ts`:

```ts
  run: (cli: AnyCLI) => {
    void executeCLI({
      cli,
      input: process.argv.slice(2),
      stdout: process.stdout,
      stderr: process.stderr,
      onExitCode: (exitCode) => {
        process.exitCode = exitCode;
      },
    });
  },
```

In `src/index.ts`:

- Export `executeCLI`, `generateHelpText`, `CLIExample`, and `OutputStream`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/executeCLI/executeCLI.test.ts`
Expected: PASS (both unit and subprocess tests).

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/executeCLI/executeCLI.ts src/AcclimateCLI/executeCLI/executeCLI.test.ts src/Acclimate.ts src/index.ts
git commit -m "feat: add executeCLI boundary and wire Acclimate.run stderr errors and exit codes"
```

---

### Task 8: Update documentation (`docs/argument-parsing.md` and `README.md`) and run full verification

**Files:**

- Modify: `docs/argument-parsing.md`
- Modify: `README.md`

- [ ] **Step 1: Update `docs/argument-parsing.md`**

Add sections documenting:

- Built-in `-h` / `--help` recognition, precedence over validation/prompts/errors/actions, `--` pass-through, and explicit user flag collision rules.
- Help output structure (`Usage` synopsis, `choices`, `defaults`, `Examples`, inherited global options, `.usage()`, `.addExample()`).
- Error reporting contract (`CLIError` help context, `formatCLIError`, `executeCLI`, `Acclimate.run` writing errors + recovery hints + usage to `stderr` and setting `process.exitCode = 1`).

- [ ] **Step 2: Update `README.md`**

Update API exports, builder methods (`.usage()`, `.addExample()`, async `.action()`), `executeCLI`, `generateHelpText`, help/unknown-flag behavior, and check off completed To Do items (built-in `--help` and clean user-friendly error messages without stack traces).

- [ ] **Step 3: Run full verification suite**

Run: `npm run format && npm run type && npm run lint && npm test && npm run build`
Expected: All commands exit 0 with zero errors or warnings.

- [ ] **Step 4: Commit documentation updates**

```bash
git add docs/argument-parsing.md README.md
git commit -m "docs: document built-in help handling, command metadata, and stderr error reporting"
```
