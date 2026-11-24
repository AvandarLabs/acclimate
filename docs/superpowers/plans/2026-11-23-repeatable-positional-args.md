# Repeatable Positional Arguments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strongly typed variadic (repeatable) positional arguments (`variadic: true`) and POSIX-style schema-aware option/positional interleaving with `--` end-of-options handling to `@avandar/acclimate`.

**Architecture:** Extract parameter type definitions into `src/AcclimateCLI/CLIParam.types.ts` with discriminated scalar vs variadic positional shapes, add builder-time variadic-must-be-last validation in `AcclimateCLI.ts`, and split `runCLI` into focused pure modules (`tokenizeCLIInput` for schema-aware tokenization + subcommand descent, and `parseCLIParamValue` for parsing + `choices` + `validator` checks). Update `generateHelpText`, `CLIError`, `docs/argument-parsing.md`, and `README.md`.

**Tech Stack:** TypeScript 5.9 (ESM, strict mode, `verbatimModuleSyntax`), Node.js >= 18, Vitest 2, ESLint 9, Prettier 3, `tsup`, `change-case`, `ts-pattern`, `type-fest`.

---

## File Map

- **Modify:** `src/CLIError.ts` - Add `missing_option_value` error code/factory and expose `readonly code`.
- **Create:** `src/AcclimateCLI/CLIParam.types.ts` - Scalar and variadic positional/option param types, `CLIParamScalarValue`, `CLIParamDataType`, `ValueOfParam`.
- **Modify:** `src/AcclimateCLI/AcclimateCLI.types.ts` - Re-export param types from `CLIParam.types.ts`, keep builder/state types concise (under 400 lines).
- **Modify:** `src/index.ts` - Export `CLIError` and new positional param types (`CLIScalarPositionalParam`, `CLIVariadicPositionalParam`, `CLIParamScalarValue`).
- **Modify:** `src/AcclimateCLI/AcclimateCLI.ts` - Enforce variadic positional arg must be last in `addPositionalArg`.
- **Modify:** `src/AcclimateCLI/createCLI/createCLI.test.ts` - Builder validation and compile-time type tests for scalar and variadic positional args.
- **Create:** `src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.ts` - Pure scalar parser/validator (default parsers, `NaN` guard, `choices`, custom `parser`/`validator`, default validation).
- **Create:** `src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.test.ts` - Unit tests for `parseCLIParamValue`.
- **Create:** `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts` - Pure functional tokenizer + subcommand descent (interleaved flags, boolean vs value options, `=value`, `--`, lone `-`, negative numbers, unknown options, missing option values).
- **Create:** `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts` - Unit tests for `tokenizeCLIInput`.
- **Modify:** `src/AcclimateCLI/runCLI/runCLI.ts` - Integrate `tokenizeCLIInput`, `parseCLIParamValue`, and fixed + variadic positional arg allocation/prompting.
- **Modify:** `src/AcclimateCLI/runCLI/runCLI.test.ts` - End-to-end tests for variadic positionals, interleaving, `--`, `choices`, `askIfEmpty`, global options + subcommands, and error cases.
- **Modify:** `src/AcclimateCLI/generateHelpText/generateHelpText.ts` - Render variadic positional args as `name... (type[])` and fix pre-existing lint/type errors.
- **Modify:** `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts` - Tests for variadic positional arg help output.
- **Create:** `docs/argument-parsing.md` - High-level documentation of positional args, option interleaving, `--`, validation, and errors.
- **Modify:** `README.md` - Document variadic positional args and updated parsing semantics.

---

### Task 1: Add `CLIError.missingOptionValue` and `readonly code`

**Files:**

- Modify: `src/CLIError.ts`
- Modify: `src/AcclimateCLI/createCLI/createCLI.test.ts`

- [ ] **Step 1: Write failing test for `CLIError.code` on invalid positional arg config**

Add assertion in `src/AcclimateCLI/createCLI/createCLI.test.ts` checking `error instanceof CLIError` and `error.code === "invalid_positional_arg_config"`, and a test for `CLIError.missingOptionValue` producing `code === "missing_option_value"`.

```ts
import { CLIError } from "@/CLIError";

it("sets code invalid_positional_arg_config when required arg follows optional arg", () => {
  const cli = createCLI("test-cli");
  let caughtError: unknown;
  try {
    cli
      .addPositionalArg({ name: "maybe", type: "string", required: false })
      .addPositionalArg({ name: "must", type: "string", required: true });
  } catch (error) {
    caughtError = error;
  }
  expect(caughtError).toBeInstanceOf(CLIError);
  expect((caughtError as CLIError).code).toBe("invalid_positional_arg_config");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: FAIL (`code` is `undefined` on `CLIError`).

- [ ] **Step 3: Update `src/CLIError.ts`**

Add `CLIErrorCode`, `missing_option_value` union member + static `missingOptionValue`, and `readonly code: CLIErrorCode` assigned in constructor:

```ts
export type CLIErrorCode = CLIErrorInfo["code"];
```

Inside `CLIError`:

```ts
  /** Machine-readable error code describing why CLI execution failed. */
  readonly code: CLIErrorCode;

  /** Build an error for a value-taking option invoked without a value. */
  static missingOptionValue(options: {
    cliName: string;
    optionName: string;
    message?: string;
  }): CLIError {
    return new CLIError({
      cliName: options.cliName,
      message:
        options.message ?? `Option "${options.optionName}" requires a value`,
      code: "missing_option_value",
      details: { optionName: options.optionName },
    });
  }

  constructor(options: CLIErrorOptions) {
    super(`❌ Error running ${options.cliName}: ${options.message}`);
    this.code = options.code;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CLIError.ts src/AcclimateCLI/createCLI/createCLI.test.ts
git commit -m "feat: add missing_option_value error and expose CLIError.code"
```

---

### Task 2: Add Variadic Positional Types & Builder Ordering Validation

**Files:**

- Create: `src/AcclimateCLI/CLIParam.types.ts`
- Modify: `src/AcclimateCLI/AcclimateCLI.types.ts`
- Modify: `src/AcclimateCLI/AcclimateCLI.ts`
- Modify: `src/index.ts`
- Modify: `src/AcclimateCLI/createCLI/createCLI.test.ts`

- [ ] **Step 1: Write failing builder validation & type tests**

In `src/AcclimateCLI/createCLI/createCLI.test.ts`, add tests covering:

- Throws `CLIError` (`code: "invalid_positional_arg_config"`) when adding a scalar positional arg after a variadic positional arg.
- Throws `CLIError` (`code: "invalid_positional_arg_config"`) when adding a second variadic positional arg after a variadic positional arg.
- Throws `CLIError` (`code: "invalid_positional_arg_config"`) when adding a required variadic arg after an optional fixed arg.
- Allows optional variadic alone, required variadic alone, required fixed + optional variadic, required fixed + required variadic, and optional fixed + optional variadic.
- Compile-time type checks with `expectTypeOf` verifying `paths` is inferred as `string[]`, `ports` as `number[]`, `flags` as `boolean[]`, `formats` with `choices: ["stylish", "agent", "json"] as const` as `("stylish" | "agent" | "json")[]`, and existing scalar args stay `string` / `number` / `boolean`.

- [ ] **Step 2: Run tests and typecheck to verify failure**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: FAIL (variadic ordering not rejected and `variadic` property not in `CLIPositionalParam`).

- [ ] **Step 3: Create `src/AcclimateCLI/CLIParam.types.ts` and update `AcclimateCLI.types.ts`, `AcclimateCLI.ts`, and `src/index.ts`**

1. Create `src/AcclimateCLI/CLIParam.types.ts` with `CLIParamScalarValue`, `CLIParamDataType`, `CLIBaseParam`, `CLIStringParam`, `CLINumberParam`, `CLIBooleanParam`, `CLIParam`, `CLIScalarPositionalParam`, `CLIVariadicStringParam`, `CLIVariadicNumberParam`, `CLIVariadicBooleanParam`, `CLIVariadicPositionalParam`, `CLIPositionalParam`, `CLIOptionParam`, and `ValueOfParam`.
2. Re-export those types from `src/AcclimateCLI/AcclimateCLI.types.ts` so all existing internal/external imports keep working seamlessly, and keep `AcclimateCLI.types.ts` well under 400 lines.
3. Update `src/AcclimateCLI/AcclimateCLI.ts` in `addPositionalArg` to check for an existing variadic positional arg before the required-after-optional check:

```ts
const existingVariadicArg = state.positionalArgs.find((existingParam) => {
  return existingParam.variadic === true;
});
if (existingVariadicArg) {
  throw CLIError.invalidPositionalArgConfig({
    cliName,
    positionalArgName: param.name,
    message: `Variadic positional argument "${existingVariadicArg.name}" must be the last positional argument`,
  });
}
```

4. Export `CLIError`, `CLIErrorCode`, `CLIParamScalarValue`, `CLIScalarPositionalParam`, and `CLIVariadicPositionalParam` from `src/index.ts`.

- [ ] **Step 4: Run tests and verify pass**

Run: `npx vitest run src/AcclimateCLI/createCLI/createCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/CLIParam.types.ts src/AcclimateCLI/AcclimateCLI.types.ts src/AcclimateCLI/AcclimateCLI.ts src/index.ts src/AcclimateCLI/createCLI/createCLI.test.ts
git commit -m "feat: add variadic positional param types and builder ordering checks"
```

---

### Task 3: Create `parseCLIParamValue` Module (TDD)

**Files:**

- Create: `src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.ts`
- Create: `src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.test.ts`

- [ ] **Step 1: Write failing unit tests in `parseCLIParamValue.test.ts`**

Test observable outcomes:

- Returns raw string unchanged for default string param.
- Parses base-10 integer for default number param (including negative numbers like `"-5"`).
- Throws `CLIError` (`invalid_cli_param_value`) when default number parser receives non-numeric input (`"abc"`).
- Parses `"false"` as `false` and `""` / `"true"` as `true` for default boolean param.
- Uses custom `parser` when provided.
- Accepts values in `choices` and throws `CLIError` (`invalid_cli_param_value`) listing allowed choices when value is not in `choices`.
- Runs custom `validator`, throwing `CLIError` (`invalid_cli_param_value`) with default message on `false` or custom message on string return.
- Returns `undefined` when both `inputValue` and `defaultValue` are `undefined`.
- Returns validated `defaultValue` when `inputValue` is `undefined`, throwing when `defaultValue` violates `choices` or `validator`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.test.ts`
Expected: FAIL (module does not exist yet).

- [ ] **Step 3: Implement `parseCLIParamValue.ts`**

Pure helper functions (`_validateParsedValue`, `_parseRawValue`) declared above exported `parseCLIParamValue`. Keep each function <= 45 lines, readonly inputs, no `any`, no unnecessary casts, proper JSDoc.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/parseCLIParamValue/parseCLIParamValue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/parseCLIParamValue/
git commit -m "feat: add parseCLIParamValue with choices and numeric validation"
```

---

### Task 4: Create `tokenizeCLIInput` Module (TDD)

**Files:**

- Create: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`
- Create: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`

- [ ] **Step 1: Write failing unit tests in `tokenizeCLIInput.test.ts`**

Test observable outcomes:

- Places positional args before, between, and after boolean flags and value-taking options into `rawPositionalArgs` in input order.
- Boolean flag consumes zero following tokens so the next token becomes a positional arg.
- Value-taking string and number options consume exactly one following token; any extra non-flag tokens become positional args.
- Splits `--option=value` and `-a=value` on the first `=` only (preserving `=` in values and empty `""` for `--opt=`).
- Supports `--flag=false` and `--flag=true` for boolean options.
- Treats every token after `--` as a positional arg, including flag-like strings (`-x`, `--foo`), a second `--`, and subcommand names.
- Treats lone `"-"` as a positional arg or as a value for a preceding value-taking option.
- Treats unregistered negative numbers (`"-1"`, `"-3.5"`) as option values when an option awaits a value and as positional args otherwise; still recognizes `"-1"` as a flag if registered as an alias.
- Throws `CLIError` (`unknown_option`) on unrecognized flags before `--` (with or without `=value`).
- Throws `CLIError` (`missing_option_value`) when a value-taking option is at end of input, followed by `--`, or followed by another flag.
- Resolves subcommands when global options appear before or after the subcommand, merging parent global options onto `targetCLI` and letting later occurrences override earlier ones.
- Resolves deeply nested subcommands (`root -> dev -> models -> new`).
- Does not descend into a subcommand when `--` appears first, when a positional arg appeared earlier, or when a root-only local option was provided before the command name.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`
Expected: FAIL (module does not exist yet).

- [ ] **Step 3: Implement `tokenizeCLIInput.ts`**

Implement pure functional scanner using `Array.prototype.reduce` (or recursive descent on command match, with no imperative `for`/`while` loops over collections). Keep every helper prefixed with `_`, declared above `tokenizeCLIInput`, each <= 45 lines, file well under 400 lines.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/tokenizeCLIInput/
git commit -m "feat: add schema-aware tokenizeCLIInput with interleaving and double-dash"
```

---

### Task 5: Integrate Tokenizer & Variadic Allocation into `runCLI` (TDD)

**Files:**

- Modify: `src/AcclimateCLI/runCLI/runCLI.ts`
- Modify: `src/AcclimateCLI/runCLI/runCLI.test.ts`

- [ ] **Step 1: Write failing end-to-end tests in `runCLI.test.ts`**

Add tests for:

- Optional variadic string positional arg receives `[]` when zero args provided.
- Optional variadic string positional arg returns a fresh copy of `defaultValue` when zero args provided (and validates default values).
- Required variadic positional arg throws `CLIError` (`missing_required_positional_arg`) when zero args provided (even if `defaultValue` is set).
- Optional and required variadic positional args collect multiple values across string, number (including negative numbers), and boolean types.
- Fixed positional args followed by variadic positional arg allocate leading tokens to fixed args and remaining tokens to the variadic array.
- Interleaved flags before, between, and after variadic positional args (including the motivating `avandar-lint coverage [PATH]... [--format stylish|agent|json] [--no-prompt]` case and global `--verbose` before/after subcommand).
- `--` separator passes flag-like tokens (`--not-a-flag`, `-x`, `--`) into variadic positional args.
- Element-level `choices`, custom `parser`, and custom `validator` run on every variadic element and throw `CLIError` (`invalid_cli_param_value`) on invalid elements.
- `askIfEmpty` prompts for empty variadic positional arg (non-empty answer yields 1-element array; empty answer uses `defaultValue` or `[]`).
- Extra non-flag tokens after a value-taking option on a CLI with no positional args throw `CLIError` (`too_many_positional_args`), while a single token containing spaces (`"one two three"`) is parsed as the option value.
- Unknown option before `--` throws `CLIError` (`unknown_option`); value-taking option without value throws `CLIError` (`missing_option_value`).

Update legacy test `"parses required + optional options (mix -- and -)"` to pass `"one two three"` as a single token (replacing the old greedy multi-token join behavior documented in the spec).

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/AcclimateCLI/runCLI/runCLI.test.ts`
Expected: FAIL on new variadic, interleaving, `--`, unknown option, and missing option value tests.

- [ ] **Step 3: Refactor `src/AcclimateCLI/runCLI/runCLI.ts`**

Replace the old split-on-first-`-` loop and `_replaceAliases` with `tokenizeCLIInput`, replace `_parseAndValidateValue` with `parseCLIParamValue`, and add `_parseVariadicPositionalArg` + `_parseScalarPositionalArg` helpers. Keep `runCLI.ts` concise (~200 lines), every function <= 45 lines, `for...of` only for sequential `await` prompting loops.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/runCLI.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/runCLI.ts src/AcclimateCLI/runCLI/runCLI.test.ts
git commit -m "feat: support variadic positional args and interleaved flags in runCLI"
```

---

### Task 6: Render Variadic Positional Args in `generateHelpText` (TDD)

**Files:**

- Modify: `src/AcclimateCLI/generateHelpText/generateHelpText.ts`
- Modify: `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`

- [ ] **Step 1: Write failing help-text tests**

Add tests in `generateHelpText.test.ts`:

- Formats optional variadic positional arg as `paths... (string[]) optional - ...`.
- Formats optional variadic positional arg with default array as `[default: ["."]]`.
- Formats required variadic positional arg as `files... (string[]) required - ...`.
- Preserves exact format for fixed positional args alongside variadic positional args.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`
Expected: FAIL (`paths (string)` instead of `paths... (string[])`).

- [ ] **Step 3: Update `generateHelpText.ts`**

1. Extend `CLIParamWithRequired` to accept optional `variadic?: boolean` and array `defaultValue`.
2. In `_formatParamLine`:
   - `displayName`: if `param.variadic === true`, append `"..."` to `param.name`.
   - `typeLabel`: `param.variadic === true ? `${param.type}[]` : param.type`.
3. Fix the 4 pre-existing lint/type errors (`Array<{ name: string; description?: string }>`, block arrow bodies, remove unused `idx`).
4. Prefix non-exported top-level helpers with `_` where edited and ensure docstrings/formatting comply with project rules.

- [ ] **Step 4: Run tests and full type/lint check**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts && npm run type && npm run lint`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/generateHelpText/generateHelpText.ts src/AcclimateCLI/generateHelpText/generateHelpText.test.ts
git commit -m "feat: render variadic positional arguments in help output"
```

---

### Task 7: Update Project Docs & `README.md`

**Files:**

- Create: `docs/argument-parsing.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/argument-parsing.md`**

Document the architecture and behavior of Acclimate's argument parsing pipeline:

- Fixed vs variadic positional arguments (`variadic: true`, ordering invariants, types, defaults, `askIfEmpty`).
- Schema-aware tokenization (`tokenizeCLIInput`), option/positional interleaving, boolean flags vs value-taking options, `=value` syntax, `--` separator, lone `-`, negative numeric tokens.
- Subcommand dispatch and global option inheritance.
- Value parsing, `choices`, custom `parser`/`validator`, and `CLIError` codes.

- [ ] **Step 2: Update `README.md`**

Update:

- Public exports list (`Acclimate`, `CLIError`, positional/option param types).
- `CLIPositionalParam` documentation with `variadic?: boolean` and array `defaultValue`.
- Parsing behavior section (interleaving, single-token values, `=value`, boolean flags, `--` separator, unknown options, missing option values).
- Add a concise variadic positional args + interleaved flags example.

- [ ] **Step 3: Run full verification suite**

Run: `npm run format && npm test && npm run type && npm run lint && npm run build`
Expected: All checks pass with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add docs/argument-parsing.md README.md
git commit -m "docs: document variadic positional arguments and interleaved parsing"
```

---

### Task 8: Final Verification, Code Review, and Walkthrough

- [ ] **Step 1: Run `/avandar-code-review` across the branch**

Review every `+` line in `git diff 9f5d3c3...HEAD` against all applicable checklists (Common Mistakes, General Checks, Comments, Module Hierarchy, Code Smells, TypeScript, Types, Functional Style, Tests). Fix every violation, run `npm run format && npm run type && npm run lint && npm test && npm run build`, and commit fixes.

- [ ] **Step 2: Run `/diff-review` and commit walkthrough**

Run full `/diff-review` workflow and save/commit the walkthrough Markdown to `docs/code-walkthroughs/2026-11-23_repeatable-positional-args.md` (never commit walkthrough PDFs or `.difit/` artifacts).

- [ ] **Step 3: Final clean-tree verification**

Confirm `git status` is clean and re-run `npm test && npm run type && npm run lint && npm run build` after final commit.
