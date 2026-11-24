# Semantic Theming and Injectable Execution IO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `NO_COLOR`/`TERM=dumb`/TTY-aware dark-terminal semantic theme layer used consistently across help text, prompts/menus, errors, and status helpers, alongside injectable execution IO and `Promise<number>` exit-code returns on `Acclimate.run`, `Acclimate.execute`, and `executeCLI`.

**Architecture:** Build a zero-dependency `src/theme/` subsystem (`theme.constants.ts`, `theme.types.ts`, `stripAnsi`, `createTheme`, `makeThemeFromOptions`) backed by `isColorEnabledForStream` with optional `isTTY` overrides, plus `PromptIo` conversion and an `AsyncLocalStorage`-based `ExecutionIoContext`. Bind per-stream themes in `runCLI` and `executeCLI` so `stdout` help and `stderr` diagnostics/errors/usage independently honor TTY, `NO_COLOR`, and `TERM=dumb`, while `Acclimate.run(cli, options?)` and `Acclimate.execute(cli, options?)` return `Promise<number>` without ever calling `process.exit()`.

**Tech Stack:** TypeScript 5.9 (strict ESM), Node.js >=18 (`node:async_hooks`, `node:stream`), Vitest 2.1, ESLint 9, Prettier 3, tsup 8.

---

## File Structure

- **Modify:** `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.ts` - accept optional `isTTY` override and optional `stream`.
- **Modify:** `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts` - test `isTTY` override precedence against `NO_COLOR` and `TERM=dumb`.
- **Create:** `src/theme/theme.constants.ts` - `ANSI_RESET_CODE`, `ANSI_STYLE_CODES`, `SEMANTIC_THEME_ROLES`, `DEFAULT_DARK_THEME_PALETTE`.
- **Create:** `src/theme/theme.types.ts` - `SemanticThemeRole`, `AnsiStyleToken`, `SemanticRoleStyleInput`, `SemanticThemePalette`, `SemanticThemePaletteOverrides`, `CreateThemeOptions`, `SemanticTheme`, `ThemeInput`.
- **Create:** `src/theme/stripAnsi/stripAnsi.ts` + `stripAnsi.test.ts` - ANSI CSI escape stripper for plain-mode guarantees.
- **Create:** `src/theme/createTheme/createTheme.ts` + `createTheme.test.ts` - dark-terminal semantic theme builder respecting TTY/`NO_COLOR`/`TERM=dumb`.
- **Create:** `src/theme/makeThemeFromOptions/makeThemeFromOptions.ts` + `makeThemeFromOptions.test.ts` - normalizes `ThemeInput`, `color`, `stream`, `isTTY`, and `env` into a `SemanticTheme`.
- **Modify:** `src/terminalSession/terminalSession.types.ts` - add `PromptIo` contract.
- **Create:** `src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.ts` + `.test.ts` - converts `PromptIo` + `env` to `TerminalSession`.
- **Create:** `src/AcclimateCLI/ExecutionIoContext/ExecutionIoContext.ts` + `.test.ts` - `AsyncLocalStorage`-backed execution IO scope.
- **Modify:** `src/generateTerminalMessage/generateTerminalMessage.ts` + `.test.ts` - support semantic role tokens and `{ theme, stream, isTTY, env }`.
- **Modify:** `src/AcclimateCLI/generateHelpText/generateHelpText.ts` + `.test.ts` - style all help sections via `SemanticTheme` with stream/env/color support.
- **Modify:** `src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts` - forward optional `theme` when rendering attached usage.
- **Modify:** `src/AcclimateCLI/formatCLIError/formatCLIError.ts` + `.test.ts` - style errors and recovery hints via `SemanticTheme` and sanitize usage in plain mode.
- **Modify:** `src/requestChoiceMenu/requestChoiceMenu.types.ts`, `renderChoiceMenu/renderChoiceMenu.ts` + `.test.ts`, `runPlainChoiceMenu.ts`, `requestChoiceMenu.ts` + `.test.ts` - semantic theme styling and injectable `PromptIo`/streams/env.
- **Modify:** `src/requestTerminalInput/requestTerminalInput.ts` + `.test.ts`, `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.ts` + `.test.ts`, `src/AcclimateCLI/runCLI/parseTargetCLIArgs.ts` - semantic theme styling and injectable `PromptIo`/streams/env.
- **Modify:** `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`, `src/AcclimateCLI/runCLI/runCLI.ts`, `src/AcclimateCLI/executeCLI/executeCLI.ts` - bind per-stream themes, TTY overrides, `PromptIo`, and `ExecutionIoContext`.
- **Modify:** `src/AcclimateCLI/runCLI/__tests__/runCLI.options.test.ts`, `runCLI.positional.test.ts`, `runCLI.help.test.ts`, `runCLI.errors.test.ts`, `src/AcclimateCLI/executeCLI/__tests__/executeCLI.unit.test.ts`, `executeCLI.subprocess.test.ts` - verify dark-terminal theme codes and plain-mode stdout/stderr behavior.
- **Modify:** `src/Acclimate.ts`, `src/index.ts`, `examples/basic.ts` - expose `Acclimate.run` (`Promise<number>` + injectable options), `Acclimate.execute`, `Acclimate.theme`, `Acclimate.createTheme`, `Acclimate.setTheme`, `Acclimate.resetTheme`, `Acclimate.printSuccess/Info/Warn/Error`, and public exports.
- **Create:** `src/__tests__/acclimateRunAndTheme.integration.test.ts` - comprehensive in-process integration tests for semantic theming, plain mode, injectable IO, concurrent `AsyncLocalStorage` isolation, and exit codes.
- **Create / Modify Docs:** `docs/semantic-theming-and-io.md`, `docs/interactive-prompts.md`, `README.md`.

---

### Task 1: Extend `isColorEnabledForStream` with optional `isTTY` override

**Files:**

- Modify: `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.ts`
- Test: `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`

- [ ] **Step 1: Add failing tests for `isTTY` override and omitted stream**

Add two tests to `src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`:

```ts
it("honors explicit isTTY override over stream.isTTY while still respecting NO_COLOR and TERM=dumb", () => {
  expect(
    isColorEnabledForStream({
      stream: { write: () => {}, isTTY: false },
      isTTY: true,
      env: { TERM: "xterm-256color" },
    }),
  ).toBe(true);
  expect(
    isColorEnabledForStream({
      stream: { write: () => {}, isTTY: true },
      isTTY: false,
      env: { TERM: "xterm-256color" },
    }),
  ).toBe(false);
  expect(
    isColorEnabledForStream({
      isTTY: true,
      env: { NO_COLOR: "1" },
    }),
  ).toBe(false);
  expect(
    isColorEnabledForStream({
      isTTY: true,
      env: { TERM: "dumb" },
    }),
  ).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`
Expected: FAIL (type/behavior mismatch because `isTTY` is not yet supported and `stream` is required).

- [ ] **Step 3: Update `isColorEnabledForStream` to support `isTTY` and optional `stream`**

```ts
import type { TerminalOutputStream } from "../terminalSession.types";

/**
 * Checks whether ANSI color output should be enabled for a stream based on its
 * TTY status (or explicit `isTTY` override), `NO_COLOR`, and `TERM`.
 *
 * Used by themes, terminal sessions, error formatters, and `Acclimate.log` so
 * piped streams, `NO_COLOR`, and `TERM=dumb` stay plain text.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/terminalSession/isColorEnabledForStream/isColorEnabledForStream.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/terminalSession/isColorEnabledForStream/
git commit -m "feat: support explicit isTTY overrides in isColorEnabledForStream"
```

---

### Task 2: Add `src/theme/` constants, types, `stripAnsi`, `createTheme`, and `makeThemeFromOptions`

**Files:**

- Create: `src/theme/theme.constants.ts`
- Create: `src/theme/theme.types.ts`
- Create: `src/theme/stripAnsi/stripAnsi.ts`
- Test: `src/theme/stripAnsi/stripAnsi.test.ts`
- Create: `src/theme/createTheme/createTheme.ts`
- Test: `src/theme/createTheme/createTheme.test.ts`
- Create: `src/theme/makeThemeFromOptions/makeThemeFromOptions.ts`
- Test: `src/theme/makeThemeFromOptions/makeThemeFromOptions.test.ts`

- [ ] **Step 1: Create `src/theme/theme.constants.ts` and `src/theme/theme.types.ts`**

`src/theme/theme.constants.ts`:

```ts
/** ANSI SGR reset sequence terminating styled terminal text. */
export const ANSI_RESET_CODE = "\x1b[0m";

/** Named ANSI SGR escape sequences supported in terminal templates and themes. */
export const ANSI_STYLE_CODES = {
  reset: ANSI_RESET_CODE,
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bright_black: "\x1b[90m",
  gray: "\x1b[90m",
  grey: "\x1b[90m",
  bright_red: "\x1b[91m",
  bright_green: "\x1b[92m",
  bright_yellow: "\x1b[93m",
  bright_blue: "\x1b[94m",
  bright_magenta: "\x1b[95m",
  bright_cyan: "\x1b[96m",
  bright_white: "\x1b[97m",
} as const;

/** Ordered semantic styling roles supported across Acclimate output surfaces. */
export const SEMANTIC_THEME_ROLES = [
  "heading",
  "accent",
  "value",
  "muted",
  "success",
  "warning",
  "error",
  "info",
  "prompt",
  "selected",
] as const;

/**
 * High-contrast default semantic palette designed for dark terminals using the
 * bright half of the ANSI SGR palette (`90`-`97`, plus `bold` on `selected`).
 */
export const DEFAULT_DARK_THEME_PALETTE = {
  heading: ANSI_STYLE_CODES.bright_yellow,
  accent: ANSI_STYLE_CODES.bright_cyan,
  value: ANSI_STYLE_CODES.bright_white,
  muted: ANSI_STYLE_CODES.bright_black,
  success: ANSI_STYLE_CODES.bright_green,
  warning: ANSI_STYLE_CODES.bright_yellow,
  error: ANSI_STYLE_CODES.bright_red,
  info: ANSI_STYLE_CODES.bright_blue,
  prompt: ANSI_STYLE_CODES.bright_cyan,
  selected: `${ANSI_STYLE_CODES.bold}${ANSI_STYLE_CODES.bright_green}`,
} as const;
```

`src/theme/theme.types.ts`:

```ts
import type { ANSI_STYLE_CODES, SEMANTIC_THEME_ROLES } from "./theme.constants";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";

/** Named ANSI style token accepted when configuring semantic theme roles. */
export type AnsiStyleToken = keyof typeof ANSI_STYLE_CODES;

/** Semantic styling role identifying the meaning of a terminal text segment. */
export type SemanticThemeRole = (typeof SEMANTIC_THEME_ROLES)[number];

/** Style input accepted for a semantic role override. */
export type SemanticRoleStyleInput =
  | AnsiStyleToken
  | readonly AnsiStyleToken[]
  | `\x1b[${string}`;

/** Complete mapping from each semantic role to its ANSI prefix sequence. */
export type SemanticThemePalette = Record<SemanticThemeRole, string>;

/** Partial role overrides merged onto the default dark-terminal palette. */
export type SemanticThemePaletteOverrides = Partial<
  Record<SemanticThemeRole, SemanticRoleStyleInput>
>;

/** Options for creating a TTY- and environment-aware semantic theme. */
export type CreateThemeOptions = {
  /** Explicit color override bypassing stream and environment checks. */
  color?: boolean;

  /** Target output stream whose `isTTY` flag is inspected for color support. */
  stream?: TerminalOutputStream;

  /** Explicit TTY override taking precedence over `stream.isTTY`. */
  isTTY?: boolean;

  /** Environment variables checked for `NO_COLOR` and `TERM`. */
  env?: Readonly<Record<string, string | undefined>>;

  /** Partial semantic role overrides merged onto the dark-terminal palette. */
  palette?: Readonly<SemanticThemePaletteOverrides>;
};

/**
 * Semantic theme formatter exposing role-based styling methods that emit ANSI
 * escapes only when color is enabled for the target stream and environment.
 */
export type SemanticTheme = {
  /** Whether ANSI escape sequences are emitted by this theme. */
  isColorEnabled: boolean;

  /** Active ANSI prefix sequence for every semantic role. */
  palette: SemanticThemePalette;

  /** Style `text` using the named semantic role, or return plain text. */
  style: (role: SemanticThemeRole, text: string) => string;

  /** Return a theme sharing this palette with a new color toggle. */
  withColor: (isColorEnabled: boolean) => SemanticTheme;

  /** Style section headings (for example `Usage` and `Options`). */
  heading: (text: string) => string;

  /** Style primary accents such as CLI and command names. */
  accent: (text: string) => string;

  /** Style parameter names, command labels, and concrete values. */
  value: (text: string) => string;

  /** Style secondary descriptions, hints, and badges. */
  muted: (text: string) => string;

  /** Style success confirmations and status banners. */
  success: (text: string) => string;

  /** Style warnings, recovery guidance, and cancellations. */
  warning: (text: string) => string;

  /** Style error messages, required markers, and inline failures. */
  error: (text: string) => string;

  /** Style informational progress and diagnostic status notices. */
  info: (text: string) => string;

  /** Style interactive prompt questions. */
  prompt: (text: string) => string;

  /** Style the currently highlighted choice menu selection. */
  selected: (text: string) => string;
};

/** Accepts either a constructed `SemanticTheme` or partial palette overrides. */
export type ThemeInput =
  | SemanticTheme
  | Readonly<SemanticThemePaletteOverrides>;
```

- [ ] **Step 2: Write failing tests for `stripAnsi`, `createTheme`, and `makeThemeFromOptions`**

`src/theme/stripAnsi/stripAnsi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stripAnsi } from "./stripAnsi";

describe("stripAnsi", () => {
  it("removes ANSI SGR color and CSI control escapes while preserving text and emoji", () => {
    const styled =
      "\x1b[?25l\x1b[1m\x1b[92m❯ coverage\x1b[0m - \x1b[90m✅ ready\x1b[0m\x1b[?25h";

    expect(stripAnsi(styled)).toBe("❯ coverage - ✅ ready");
  });

  it("returns plain text unchanged when no ANSI sequences are present", () => {
    expect(stripAnsi("❌ Error: missing --format\n  ⚠️ Run tool --help")).toBe(
      "❌ Error: missing --format\n  ⚠️ Run tool --help",
    );
  });
});
```

`src/theme/createTheme/createTheme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_THEME_PALETTE,
  SEMANTIC_THEME_ROLES,
} from "../theme.constants";
import { createTheme } from "./createTheme";

describe("createTheme", () => {
  it("uses only high-contrast bright-half ANSI foreground codes across every default semantic role", () => {
    const theme = createTheme({ color: true });

    SEMANTIC_THEME_ROLES.forEach((role) => {
      const prefix = theme.palette[role];
      expect(prefix).toBe(DEFAULT_DARK_THEME_PALETTE[role]);
      expect(prefix).not.toMatch(/\x1b\[3[0-7]m/);
      expect(prefix).toMatch(/\x1b\[9[0-7]m/);
      expect(theme[role]("sample")).toBe(`${prefix}sample\x1b[0m`);
      expect(theme.style(role, "sample")).toBe(`${prefix}sample\x1b[0m`);
    });

    expect(theme.selected("❯ json")).toBe("\x1b[1m\x1b[92m❯ json\x1b[0m");
    expect(theme.error("")).toBe("");
  });

  it("disables ANSI escapes when stream is redirected, NO_COLOR is non-empty, or TERM is dumb", () => {
    const redirected = createTheme({
      stream: { write: () => {}, isTTY: false },
      env: { TERM: "xterm-256color" },
    });
    const noColor = createTheme({
      isTTY: true,
      env: { NO_COLOR: "1", TERM: "xterm-256color" },
    });
    const dumbTerm = createTheme({
      isTTY: true,
      env: { TERM: "dumb" },
    });

    [redirected, noColor, dumbTerm].forEach((plainTheme) => {
      expect(plainTheme.isColorEnabled).toBe(false);
      expect(plainTheme.error("❌ Failed")).toBe("❌ Failed");
      expect(plainTheme.warning("⚠️ Try again")).toBe("⚠️ Try again");
      expect(plainTheme.selected("❯ coverage")).toBe("❯ coverage");
      expect(plainTheme.heading("Usage")).toBe("Usage");
    });
  });

  it("enables ANSI escapes when stream is a TTY and NO_COLOR is empty or unset", () => {
    const ttyTheme = createTheme({
      stream: { write: () => {}, isTTY: true },
      env: { NO_COLOR: "", TERM: "xterm-256color" },
    });

    expect(ttyTheme.isColorEnabled).toBe(true);
    expect(ttyTheme.accent("acclimate")).toBe("\x1b[96macclimate\x1b[0m");
  });

  it("applies custom token, token-array, and raw ANSI palette overrides and preserves them across withColor", () => {
    const customTheme = createTheme({
      color: true,
      palette: {
        accent: "bright_magenta",
        heading: ["bold", "bright_cyan"],
        info: "\x1b[38;5;117m",
      },
    });

    expect(customTheme.accent("cli")).toBe("\x1b[95mcli\x1b[0m");
    expect(customTheme.heading("Usage")).toBe("\x1b[1m\x1b[96mUsage\x1b[0m");
    expect(customTheme.info("Working")).toBe("\x1b[38;5;117mWorking\x1b[0m");
    expect(customTheme.error("Bad")).toBe("\x1b[91mBad\x1b[0m");

    const plainCopy = customTheme.withColor(false);
    expect(plainCopy.isColorEnabled).toBe(false);
    expect(plainCopy.accent("cli")).toBe("cli");
    expect(plainCopy.withColor(true).accent("cli")).toBe("\x1b[95mcli\x1b[0m");
  });
});
```

`src/theme/makeThemeFromOptions/makeThemeFromOptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTheme } from "../createTheme/createTheme";
import { makeThemeFromOptions } from "./makeThemeFromOptions";

describe("makeThemeFromOptions", () => {
  it("returns the provided SemanticTheme directly when no stream or color override is given", () => {
    const customTheme = createTheme({
      color: false,
      palette: { accent: "bright_magenta" },
    });

    const result = makeThemeFromOptions({ theme: customTheme });

    expect(result.isColorEnabled).toBe(false);
    expect(result.palette.accent).toBe("\x1b[95m");
  });

  it("rebinds a provided SemanticTheme palette to explicit color or stream/env detection", () => {
    const baseTheme = createTheme({
      color: true,
      palette: { accent: "bright_magenta" },
    });

    const plainFromNoColor = makeThemeFromOptions({
      theme: baseTheme,
      isTTY: true,
      env: { NO_COLOR: "1" },
    });
    expect(plainFromNoColor.isColorEnabled).toBe(false);
    expect(plainFromNoColor.accent("demo")).toBe("demo");

    const coloredOnTty = makeThemeFromOptions({
      theme: baseTheme.withColor(false),
      isTTY: true,
      env: {},
    });
    expect(coloredOnTty.isColorEnabled).toBe(true);
    expect(coloredOnTty.accent("demo")).toBe("\x1b[95mdemo\x1b[0m");
  });

  it("merges fallbackPalette and theme palette overrides and respects defaultColor when no target is supplied", () => {
    const coloredDefault = makeThemeFromOptions({
      defaultColor: true,
      fallbackPalette: { heading: "bright_magenta" },
      theme: { accent: "bright_green" },
    });

    expect(coloredDefault.isColorEnabled).toBe(true);
    expect(coloredDefault.heading("Usage")).toBe("\x1b[95mUsage\x1b[0m");
    expect(coloredDefault.accent("demo")).toBe("\x1b[92mdemo\x1b[0m");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/theme/`
Expected: FAIL because `stripAnsi.ts`, `createTheme.ts`, and `makeThemeFromOptions.ts` do not exist yet.

- [ ] **Step 4: Implement `stripAnsi.ts`, `createTheme.ts`, and `makeThemeFromOptions.ts`**

`src/theme/stripAnsi/stripAnsi.ts`:

```ts
const ANSI_CSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);

/**
 * Strips ANSI CSI color and cursor-control escape sequences from `text` while
 * preserving plain characters, newlines, and emoji.
 *
 * Use wherever plain-mode output must guarantee escape-free text, such as
 * sanitizing pre-rendered usage text on redirected streams or `NO_COLOR`.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_CSI_PATTERN, "");
}
```

`src/theme/createTheme/createTheme.ts`:

```ts
import { isColorEnabledForStream } from "@/terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import {
  ANSI_RESET_CODE,
  ANSI_STYLE_CODES,
  DEFAULT_DARK_THEME_PALETTE,
  SEMANTIC_THEME_ROLES,
} from "../theme.constants";
import type {
  CreateThemeOptions,
  SemanticRoleStyleInput,
  SemanticTheme,
  SemanticThemePalette,
  SemanticThemePaletteOverrides,
  SemanticThemeRole,
} from "../theme.types";

function _styleInputToAnsiSequence(input: SemanticRoleStyleInput): string {
  if (Array.isArray(input)) {
    return input
      .map((token) => {
        return ANSI_STYLE_CODES[token];
      })
      .join("");
  }
  if (typeof input === "string" && input.startsWith("\x1b[")) {
    return input;
  }
  return ANSI_STYLE_CODES[input as keyof typeof ANSI_STYLE_CODES];
}

function _buildPaletteFromOverrides(
  overrides?: Readonly<SemanticThemePaletteOverrides>,
): SemanticThemePalette {
  const entries = SEMANTIC_THEME_ROLES.map((role) => {
    const override = overrides?.[role];
    const sequence =
      override !== undefined ?
        _styleInputToAnsiSequence(override)
      : DEFAULT_DARK_THEME_PALETTE[role];
    return [role, sequence] as const;
  });

  return Object.fromEntries(entries) as SemanticThemePalette;
}

function _buildThemeObject(options: {
  palette: Readonly<SemanticThemePalette>;
  isColorEnabled: boolean;
}): SemanticTheme {
  const palette: SemanticThemePalette = { ...options.palette };
  const style = (role: SemanticThemeRole, text: string): string => {
    if (!options.isColorEnabled || text === "") {
      return text;
    }
    return `${palette[role]}${text}${ANSI_RESET_CODE}`;
  };

  return {
    isColorEnabled: options.isColorEnabled,
    palette,
    style,
    withColor: (nextColorEnabled: boolean): SemanticTheme => {
      return _buildThemeObject({ palette, isColorEnabled: nextColorEnabled });
    },
    heading: (text: string): string => {
      return style("heading", text);
    },
    accent: (text: string): string => {
      return style("accent", text);
    },
    value: (text: string): string => {
      return style("value", text);
    },
    muted: (text: string): string => {
      return style("muted", text);
    },
    success: (text: string): string => {
      return style("success", text);
    },
    warning: (text: string): string => {
      return style("warning", text);
    },
    error: (text: string): string => {
      return style("error", text);
    },
    info: (text: string): string => {
      return style("info", text);
    },
    prompt: (text: string): string => {
      return style("prompt", text);
    },
    selected: (text: string): string => {
      return style("selected", text);
    },
  };
}

/**
 * Creates a dark-terminal semantic theme whose role methods emit ANSI SGR
 * sequences only when color is enabled for the target stream and environment
 * (`isTTY`, `NO_COLOR`, and `TERM`).
 *
 * Use to style CLI headings, prompts, menus, help text, and status messages
 * consistently while keeping piped and `NO_COLOR`/`TERM=dumb` output plain.
 */
export function createTheme(
  options: Readonly<CreateThemeOptions> = {},
): SemanticTheme {
  const isColorEnabled =
    options.color ??
    isColorEnabledForStream({
      stream:
        options.stream ??
        (options.isTTY === undefined ? process.stderr : undefined),
      isTTY: options.isTTY,
      env: options.env,
    });
  const palette = _buildPaletteFromOverrides(options.palette);

  return _buildThemeObject({ palette, isColorEnabled });
}
```

`src/theme/makeThemeFromOptions/makeThemeFromOptions.ts`:

```ts
import { isColorEnabledForStream } from "@/terminalSession/isColorEnabledForStream/isColorEnabledForStream";
import { createTheme } from "../createTheme/createTheme";
import type {
  SemanticTheme,
  SemanticThemePaletteOverrides,
  ThemeInput,
} from "../theme.types";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";

type MakeThemeFromOptionsInput = {
  theme?: ThemeInput;
  fallbackPalette?: Readonly<SemanticThemePaletteOverrides>;
  color?: boolean;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  defaultColor?: boolean;
};

function _isSemanticTheme(value: ThemeInput): value is SemanticTheme {
  return (
    "isColorEnabled" in value &&
    typeof value.style === "function" &&
    typeof value.withColor === "function"
  );
}

/**
 * Builds a `SemanticTheme` from optional caller overrides (`theme`, `color`,
 * `stream`, `isTTY`, `env`), preserving custom palettes while binding color
 * output to explicit toggles or stream/environment detection.
 *
 * Called by `generateHelpText`, `formatCLIError`, `generateTerminalMessage`,
 * `runCLI`, `executeCLI`, and `Acclimate` output helpers.
 */
export function makeThemeFromOptions(
  options: Readonly<MakeThemeFromOptionsInput> = {},
): SemanticTheme {
  const hasStreamTarget =
    options.stream !== undefined ||
    options.isTTY !== undefined ||
    options.env !== undefined;
  const computedStreamColor =
    hasStreamTarget ?
      isColorEnabledForStream({
        stream: options.stream,
        isTTY: options.isTTY,
        env: options.env,
      })
    : undefined;

  if (options.theme !== undefined && _isSemanticTheme(options.theme)) {
    const effectiveColor =
      options.color ?? computedStreamColor ?? options.theme.isColorEnabled;
    return effectiveColor === options.theme.isColorEnabled ?
        options.theme
      : options.theme.withColor(effectiveColor);
  }

  const effectiveColor =
    options.color ?? computedStreamColor ?? options.defaultColor;
  const mergedPalette =
    options.fallbackPalette || options.theme ?
      { ...options.fallbackPalette, ...options.theme }
    : undefined;

  return createTheme({
    color: effectiveColor,
    palette: mergedPalette,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/theme/`
Expected: PASS (all theme unit tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/theme/
git commit -m "feat: add dark-terminal semantic theme layer with plain-mode fallback"
```

---

### Task 3: Add `PromptIo`, `makeTerminalSessionFromPromptIo`, and `ExecutionIoContext`

**Files:**

- Modify: `src/terminalSession/terminalSession.types.ts`
- Create: `src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.ts`
- Test: `src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.test.ts`
- Create: `src/AcclimateCLI/ExecutionIoContext/ExecutionIoContext.ts`
- Test: `src/AcclimateCLI/ExecutionIoContext/ExecutionIoContext.test.ts`

- [ ] **Step 1: Add `PromptIo` to `src/terminalSession/terminalSession.types.ts`**

Append `PromptIo` to `src/terminalSession/terminalSession.types.ts`:

```ts
/**
 * Lightweight injectable prompt IO pair converted into a `TerminalSession`
 * for interactive tests and embedded CLI callers.
 */
export type PromptIo = {
  input: TerminalInputStream;
  output: TerminalOutputStream;
  isColorEnabled?: boolean;
  isRawModeSupported?: boolean;
  close?: () => void | Promise<void>;
};
```

- [ ] **Step 2: Write failing tests for `makeTerminalSessionFromPromptIo` and `ExecutionIoContext`**

`src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.test.ts`:

```ts
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { makeTerminalSessionFromPromptIo } from "./makeTerminalSessionFromPromptIo";

describe("makeTerminalSessionFromPromptIo", () => {
  it("derives color and raw-mode capabilities from stream metadata and env when omitted", async () => {
    const closeSpy = vi.fn<() => void>();
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => {},
    });
    const output = { isTTY: true, write: () => true };

    const ttySession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output, close: closeSpy },
      env: { TERM: "xterm-256color" },
    });

    expect(ttySession.isColorEnabled).toBe(true);
    expect(ttySession.isRawModeSupported).toBe(true);
    await ttySession.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    const noColorSession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output },
      env: { NO_COLOR: "1" },
    });
    expect(noColorSession.isColorEnabled).toBe(false);
    expect(noColorSession.isRawModeSupported).toBe(true);

    const dumbSession = makeTerminalSessionFromPromptIo({
      promptIo: { input, output },
      env: { TERM: "dumb" },
    });
    expect(dumbSession.isColorEnabled).toBe(false);
    expect(dumbSession.isRawModeSupported).toBe(false);
  });

  it("honors explicit isColorEnabled and isRawModeSupported overrides", () => {
    const session = makeTerminalSessionFromPromptIo({
      promptIo: {
        input: new PassThrough(),
        output: { isTTY: false, write: () => true },
        isColorEnabled: true,
        isRawModeSupported: true,
      },
      env: { NO_COLOR: "1", TERM: "dumb" },
    });

    expect(session.isColorEnabled).toBe(true);
    expect(session.isRawModeSupported).toBe(true);
  });
});
```

`src/AcclimateCLI/ExecutionIoContext/ExecutionIoContext.test.ts`:

```ts
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createTheme } from "@/theme/createTheme/createTheme";
import { ExecutionIoContext } from "./ExecutionIoContext";

describe("ExecutionIoContext", () => {
  it("isolates injected IO stores across concurrent async executions and returns undefined outside a run", async () => {
    expect(ExecutionIoContext.get()).toBeUndefined();

    const makeStore = (tag: string) => {
      return {
        stdin: new PassThrough(),
        stdout: { write: () => true },
        stderr: { write: () => true },
        env: { RUN_TAG: tag },
        stdoutTheme: createTheme({ color: false }),
        stderrTheme: createTheme({ color: false }),
      };
    };

    const [firstTag, secondTag] = await Promise.all([
      ExecutionIoContext.run(makeStore("first"), async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        return ExecutionIoContext.get()?.env.RUN_TAG;
      }),
      ExecutionIoContext.run(makeStore("second"), async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        return ExecutionIoContext.get()?.env.RUN_TAG;
      }),
    ]);

    expect(firstTag).toBe("first");
    expect(secondTag).toBe("second");
    expect(ExecutionIoContext.get()).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/terminalSession/makeTerminalSessionFromPromptIo/ src/AcclimateCLI/ExecutionIoContext/`
Expected: FAIL because both modules do not exist yet.

- [ ] **Step 4: Implement `makeTerminalSessionFromPromptIo.ts` and `ExecutionIoContext.ts`**

`src/terminalSession/makeTerminalSessionFromPromptIo/makeTerminalSessionFromPromptIo.ts`:

```ts
import { isColorEnabledForStream } from "../isColorEnabledForStream/isColorEnabledForStream";
import type { PromptIo, TerminalSession } from "../terminalSession.types";

/**
 * Converts a lightweight `PromptIo` pair into a `TerminalSession`, deriving
 * color and raw-mode capabilities from the output stream and environment when
 * not explicitly specified.
 *
 * Called by `runCLI`, `executeCLI`, `requestChoiceMenu`, and
 * `requestTerminalInput` when callers inject `promptIo`.
 */
export function makeTerminalSessionFromPromptIo(options: {
  promptIo: Readonly<PromptIo>;
  env?: Readonly<Record<string, string | undefined>>;
}): TerminalSession {
  const env = options.env ?? process.env;
  const { promptIo } = options;

  return {
    input: promptIo.input,
    output: promptIo.output,
    isColorEnabled:
      promptIo.isColorEnabled ??
      isColorEnabledForStream({ stream: promptIo.output, env }),
    isRawModeSupported:
      promptIo.isRawModeSupported ??
      (env.TERM !== "dumb" && typeof promptIo.input.setRawMode === "function"),
    close: async () => {
      await promptIo.close?.();
    },
  };
}
```

`src/AcclimateCLI/ExecutionIoContext/ExecutionIoContext.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  TerminalInputStream,
  TerminalOutputStream,
  TerminalSession,
} from "@/terminalSession/terminalSession.types";
import type { SemanticTheme } from "@/theme/theme.types";

/** Active per-run execution streams, environment, themes, and prompt IO. */
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

const executionIoStorage = new AsyncLocalStorage<ExecutionIoStore>();

/**
 * Async-scoped storage for injected CLI streams, environment, themes, and
 * prompt IO so `Acclimate.*` helpers invoked inside command actions stay
 * isolated across concurrent in-process runs.
 *
 * Entered by `runCLI` and read by `Acclimate` facade helpers.
 */
export const ExecutionIoContext = {
  /** Return the active execution IO store, or `undefined` outside a CLI run. */
  get: (): ExecutionIoStore | undefined => {
    return executionIoStorage.getStore();
  },

  /** Execute `callback` with `store` bound for its entire async call tree. */
  run: <TResult>(store: ExecutionIoStore, callback: () => TResult): TResult => {
    return executionIoStorage.run(store, callback);
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/terminalSession/makeTerminalSessionFromPromptIo/ src/AcclimateCLI/ExecutionIoContext/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/terminalSession/terminalSession.types.ts src/terminalSession/makeTerminalSessionFromPromptIo/ src/AcclimateCLI/ExecutionIoContext/
git commit -m "feat: add PromptIo session adapter and AsyncLocalStorage ExecutionIoContext"
```

---

### Task 4: Upgrade `generateTerminalMessage` with semantic role tokens and stream/env/TTY/theme awareness

**Files:**

- Modify: `src/generateTerminalMessage/generateTerminalMessage.ts`
- Test: `src/generateTerminalMessage/generateTerminalMessage.test.ts`

- [ ] **Step 1: Add failing tests for semantic tokens, custom themes, and stream/env plain mode**

Append tests to `src/generateTerminalMessage/generateTerminalMessage.test.ts`:

```ts
it("applies semantic role tokens from the default dark palette and custom themes", () => {
  expect(
    generateTerminalMessage("|heading|Usage|reset| |error|required|reset|", {}),
  ).toBe("\x1b[93mUsage\x1b[0m \x1b[91mrequired\x1b[0m");

  const customTheme = createTheme({
    color: true,
    palette: { accent: "bright_magenta", prompt: "bright_yellow" },
  });
  expect(
    generateTerminalMessage(
      "|accent|$cli$|reset| |prompt|Proceed?|reset|",
      { cli: "acme" },
      { theme: customTheme },
    ),
  ).toBe("\x1b[95macme\x1b[0m \x1b[93mProceed?\x1b[0m");
});

it("strips semantic role tokens and raw color tokens when stream is redirected, NO_COLOR is set, or TERM is dumb", () => {
  expect(
    generateTerminalMessage(
      "|selected|❯ $name$|reset| |muted|(default)|reset|",
      { name: "json" },
      { stream: { write: () => {}, isTTY: false }, env: {} },
    ),
  ).toBe("❯ json (default)");

  expect(
    generateTerminalMessage(
      "|error|❌ Failed|reset|",
      {},
      { isTTY: true, env: { NO_COLOR: "1" } },
    ),
  ).toBe("❌ Failed");

  expect(
    generateTerminalMessage(
      "|warning|⚠️ Retry|reset|",
      {},
      { isTTY: true, env: { TERM: "dumb" } },
    ),
  ).toBe("⚠️ Retry");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/generateTerminalMessage/generateTerminalMessage.test.ts`
Expected: FAIL because semantic tokens (`|heading|`, `|error|`, `|selected|`) and `theme`/`stream`/`isTTY`/`env` options are not supported yet.

- [ ] **Step 3: Update `src/generateTerminalMessage/generateTerminalMessage.ts`**

Use `ANSI_STYLE_CODES` and `makeThemeFromOptions` to map both raw style tokens and semantic role tokens, keeping unknown tokens unchanged and keeping `defaultColor: true` when no stream/env/theme/color options are passed:

```ts
import { makeThemeFromOptions } from "@/theme/makeThemeFromOptions/makeThemeFromOptions";
import { ANSI_STYLE_CODES } from "@/theme/theme.constants";
import type { TerminalOutputStream } from "@/terminalSession/terminalSession.types";
import type { SemanticThemeRole, ThemeInput } from "@/theme/theme.types";

const PARAM_TOKEN_REGEX = /\$([a-zA-Z0-9_]+)\$/g;
const COLOR_TOKEN_REGEX = /\|([a-zA-Z_]+)\|/g;

type GenerateTerminalMessageOptions = {
  color?: boolean;
  theme?: ThemeInput;
  stream?: TerminalOutputStream;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
};

function _interpolateParams(
  message: string,
  params: Readonly<
    Record<string, string | boolean | number | null | undefined>
  >,
): string {
  return message.replace(PARAM_TOKEN_REGEX, (_match: string, key: string) => {
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}

function _lookupTokenCode(options: {
  tokenName: string;
  palette: Readonly<Record<SemanticThemeRole, string>>;
}): string | undefined {
  const normalized = options.tokenName.toLowerCase();
  if (normalized in options.palette) {
    return options.palette[normalized as SemanticThemeRole];
  }
  if (normalized in ANSI_STYLE_CODES) {
    return ANSI_STYLE_CODES[normalized as keyof typeof ANSI_STYLE_CODES];
  }
  return undefined;
}

/**
 * Formats a terminal message with `$varName$` interpolation plus raw
 * `|<COLOR>|` and semantic `|<ROLE>|` styling tokens, or strips known tokens
 * when color is disabled by `color: false`, a non-TTY stream, `NO_COLOR`, or
 * `TERM=dumb`.
 *
 * Used by `Acclimate.log`, interactive prompts, and custom consumer templates
 * to keep dark-terminal styling and plain-mode output consistent.
 */
export function generateTerminalMessage(
  message: string,
  params: Readonly<
    Record<string, string | boolean | number | null | undefined>
  > = {},
  options: Readonly<GenerateTerminalMessageOptions> = {},
): string {
  const theme = makeThemeFromOptions({
    theme: options.theme,
    color: options.color,
    stream: options.stream,
    isTTY: options.isTTY,
    env: options.env,
    defaultColor: true,
  });

  if (!theme.isColorEnabled) {
    return _interpolateParams(message, params).replace(
      COLOR_TOKEN_REGEX,
      (match, tokenName: string) => {
        return (
            _lookupTokenCode({ tokenName, palette: theme.palette }) !==
              undefined
          ) ?
            ""
          : match;
      },
    );
  }

  const hasColorToken = Boolean(message.match(COLOR_TOKEN_REGEX));
  const endsWithReset = message.trimEnd().endsWith("|reset|");
  const withReset =
    hasColorToken && !endsWithReset ? `${message}|reset|` : message;
  const interpolated = _interpolateParams(withReset, params);
  return interpolated.replace(COLOR_TOKEN_REGEX, (match, tokenName: string) => {
    return _lookupTokenCode({ tokenName, palette: theme.palette }) ?? match;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/generateTerminalMessage/generateTerminalMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generateTerminalMessage/
git commit -m "feat: support semantic role tokens and stream/env color detection in generateTerminalMessage"
```

---

### Task 5: Migrate `generateHelpText`, `attachCLIErrorHelpContext`, and `formatCLIError` to `SemanticTheme`

**Files:**

- Modify: `src/AcclimateCLI/generateHelpText/generateHelpText.ts`
- Test: `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`
- Modify: `src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts`
- Modify: `src/AcclimateCLI/formatCLIError/formatCLIError.ts`
- Test: `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`

- [ ] **Step 1: Add failing tests for plain-mode and themed help text and error formatting**

In `src/AcclimateCLI/generateHelpText/generateHelpText.test.ts`:

- Update the four dark `|red|required|reset|` expectations to `|bright_red|required|reset|` and the level-2 `|dim|No description|reset|` expectation to `|gray|No description|reset|` so all default help styling aligns with the bright dark-terminal semantic palette.
- Add new tests for plain mode (`color: false`, `NO_COLOR`, `TERM=dumb`, redirected stream) and custom `theme`:

```ts
it("omits ANSI escapes when color is false or target stream/env is plain mode", () => {
  const cli = createCLI("acclimate")
    .description("A friendly CLI")
    .addPositionalArg({
      name: "target",
      type: "string",
      required: true,
      description: "Target name",
    });

  const plainHelp = generateHelpText(cli, { color: false });
  expect(plainHelp).not.toContain("\x1b[");
  expect(plainHelp).toContain("acclimate");
  expect(plainHelp).toContain("Usage");
  expect(plainHelp).toContain("target (string) required - Target name");

  expect(generateHelpText(cli, { isTTY: true, env: { NO_COLOR: "1" } })).toBe(
    plainHelp,
  );
  expect(generateHelpText(cli, { isTTY: true, env: { TERM: "dumb" } })).toBe(
    plainHelp,
  );
  expect(
    generateHelpText(cli, {
      stream: { write: () => {}, isTTY: false },
      env: {},
    }),
  ).toBe(plainHelp);
});

it("applies custom semantic theme roles across help sections", () => {
  const cli = createCLI("acclimate").description("A friendly CLI");
  const customTheme = createTheme({
    color: true,
    palette: {
      accent: "bright_magenta",
      heading: "bright_blue",
    },
  });

  const themed = generateHelpText(cli, { theme: customTheme });
  expect(themed).toContain("\x1b[95macclimate\x1b[0m");
  expect(themed).toContain("\x1b[94mUsage\x1b[0m");
});
```

In `src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`:

- Update default dark `|red|` / `|yellow|` expectations to bright dark-terminal semantic roles (`|bright_red|` and `|bright_yellow|`).
- Add tests verifying `NO_COLOR`, `TERM=dumb`, custom `theme`, and ANSI stripping of colored `error.usage` in plain mode:

```ts
it("strips pre-styled ANSI escapes from attached usage when plain mode is active via NO_COLOR or TERM=dumb", () => {
  const error = CLIError.unknownOption({
    cliName: "demo",
    optionName: "--bad",
  }).withHelpContext({
    commandPath: ["demo"],
    hint: "Run demo --help to see available options and usage.",
    usage: "\x1b[96mdemo\x1b[0m\n\n\x1b[93mUsage\x1b[0m\n  demo [options]",
  });

  const noColorOutput = formatCLIError(error, {
    isTTY: true,
    env: { NO_COLOR: "1" },
  });
  expect(noColorOutput).not.toContain("\x1b[");
  expect(noColorOutput).toContain(
    '❌ Error running demo: Unknown option "--bad"',
  );
  expect(noColorOutput).toContain("  ⚠️ Run demo --help");
  expect(noColorOutput).toContain("demo [options]");

  const dumbOutput = formatCLIError(error, {
    isTTY: true,
    env: { TERM: "dumb" },
  });
  expect(dumbOutput).toBe(noColorOutput);
});

it("applies a custom semantic theme to error and warning lines", () => {
  const error = CLIError.unknownOption({
    cliName: "demo",
    optionName: "--bad",
  }).withHelpContext({
    commandPath: ["demo"],
    hint: "Run demo --help.",
  });
  const customTheme = createTheme({
    color: true,
    palette: { error: "bright_magenta", warning: "bright_cyan" },
  });

  const formatted = formatCLIError(error, { theme: customTheme });
  expect(formatted).toContain(`\x1b[95m${error.message}\x1b[0m`);
  expect(formatted).toContain("  \x1b[96m⚠️ Run demo --help.\x1b[0m");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: FAIL because `generateHelpText` and `formatCLIError` do not yet use `SemanticTheme` or support `color`/`theme`/`isTTY`/`env`.

- [ ] **Step 3: Refactor `generateHelpText.ts`, `attachCLIErrorHelpContext.ts`, and `formatCLIError.ts` to use `SemanticTheme`**

- In `src/AcclimateCLI/generateHelpText/generateHelpText.ts`:
  - Accept `GenerateHelpTextOptions = { commandPath?: readonly string[]; color?: boolean; theme?: ThemeInput; stream?: TerminalOutputStream; isTTY?: boolean; env?: Readonly<Record<string, string | undefined>> }`.
  - Compute `theme = makeThemeFromOptions({ theme: options?.theme, color: options?.color, stream: options?.stream, isTTY: options?.isTTY, env: options?.env, defaultColor: true })`.
  - Pass `theme` through internal `_generateHelpTextHelper`, `_buildHelpLines`, `_formatSection`, `_formatParamLine`, `_formatExamplesSection`, `_formatCommandBullets`, `_buildHeaderLines`, and `_buildCommandSection`, styling every token with `theme.accent`, `theme.heading`, `theme.value`, `theme.muted`, and `theme.error` (removing `generateTerminalMessage` and all raw `|...|` color strings).
- In `src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts`:
  - Accept optional `theme?: SemanticTheme` and pass `{ commandPath: options.commandPath, theme: options.theme }` to `generateHelpText`.
- In `src/AcclimateCLI/formatCLIError/formatCLIError.ts`:
  - Accept `FormatCLIErrorOptions = { color?: boolean; theme?: ThemeInput; stream?: TerminalOutputStream; isTTY?: boolean; env?: Readonly<Record<string, string | undefined>> }`.
  - Compute `theme = makeThemeFromOptions({ ...options, defaultColor: true })`.
  - Render error line via `theme.error(error.message)`, hint line via `` `  ${theme.warning(`⚠️ ${error.hint}`)}` ``, and usage via `theme.isColorEnabled ? error.usage : stripAnsi(error.usage)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/AcclimateCLI/generateHelpText/generateHelpText.test.ts src/AcclimateCLI/formatCLIError/formatCLIError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/generateHelpText/ src/AcclimateCLI/formatCLIError/ src/AcclimateCLI/runCLI/attachCLIErrorHelpContext.ts
git commit -m "feat: apply semantic theme and plain-mode guarantees to help text and CLIError formatting"
```

---

### Task 6: Migrate interactive menus and prompts to `SemanticTheme` and injectable `PromptIo`

**Files:**

- Modify: `src/requestChoiceMenu/requestChoiceMenu.types.ts`
- Modify: `src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.ts`
- Test: `src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.test.ts`
- Modify: `src/requestChoiceMenu/runPlainChoiceMenu.ts`
- Modify: `src/requestChoiceMenu/requestChoiceMenu.ts`
- Test: `src/requestChoiceMenu/requestChoiceMenu.test.ts`
- Modify: `src/requestTerminalInput/requestTerminalInput.ts`
- Test: `src/requestTerminalInput/requestTerminalInput.test.ts`
- Modify: `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.ts`
- Test: `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.test.ts`
- Modify: `src/AcclimateCLI/runCLI/parseTargetCLIArgs.ts`

- [ ] **Step 1: Add failing tests for custom semantic theme and `promptIo` in menus and prompts**

- In `src/requestChoiceMenu/renderChoiceMenu/renderChoiceMenu.test.ts`, add a test verifying custom `theme` overrides (`prompt`, `muted`, `selected`) apply when `isColorEnabled: true` and drop ANSI escapes when `isColorEnabled: false`.
- In `src/requestChoiceMenu/requestChoiceMenu.test.ts`, add a test accepting `promptIo` + `env: { NO_COLOR: "1" }` + custom `theme` and verifying plain-mode confirmation/cancellation output preserves `❯`, `✔`, and labels without ANSI escapes.
- In `src/requestTerminalInput/requestTerminalInput.test.ts`, add a test verifying `promptIo` + `theme` styles validation errors with `theme.error` on color TTYs and omits ANSI escapes when `NO_COLOR=1`.
- In `src/AcclimateCLI/runCLI/promptCLIParam/promptCLIParam.test.ts`, add a test verifying custom `theme` styles the prompt message via `theme.prompt`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/requestChoiceMenu/ src/requestTerminalInput/ src/AcclimateCLI/runCLI/promptCLIParam/`
Expected: FAIL because `theme` and `promptIo` options are not yet accepted or wired.

- [ ] **Step 3: Implement semantic theme and `promptIo` support across menu and prompt modules**

- Extend `ChoiceMenuOptions` and `RequestTerminalInputOptions` with optional `promptIo?: PromptIo`, `stdin?: TerminalInputStream`, `stdout?: TerminalOutputStream`, `stderr?: TerminalOutputStream`, `env?: Readonly<Record<string, string | undefined>>`, `openTty?: () => Promise<TerminalSession | undefined>`, and `theme?: ThemeInput`.
- In `renderChoiceMenu.ts`: build `theme = makeThemeFromOptions({ theme: options.theme, color: options.isColorEnabled })` and style the header (`theme.prompt` + `theme.muted`), selected row (`theme.selected`), `(default)` badge (`theme.muted`), and description (`theme.muted`).
- In `runPlainChoiceMenu.ts`: accept `theme: Readonly<SemanticTheme>` and style the heading (`theme.prompt`), `(default)`/description (`theme.muted`), and invalid-selection notice (`theme.error`).
- In `requestChoiceMenu.ts`: convert `promptIo` via `makeTerminalSessionFromPromptIo` when `terminal` is omitted, pass `stdin`/`stdout`/`stderr`/`env`/`openTty` to `openTerminalSession`, derive `menuTheme = makeThemeFromOptions({ theme: options.theme, color: session.isColorEnabled })`, and style confirmation (`theme.success("✔")`, `theme.prompt(message)`) and cancellation (`theme.warning("✖ Cancelled")`) through `menuTheme`.
- In `requestTerminalInput.ts`: convert `promptIo` via `makeTerminalSessionFromPromptIo` when `terminal` is omitted, derive `promptTheme = makeThemeFromOptions({ theme: options.theme, color: session.isColorEnabled })`, style prompt hints with `promptTheme.muted(...)` and validation errors with `promptTheme.error(...)`, and pass `theme: promptTheme` to `generateTerminalMessage` and `requestChoiceMenu`.
- In `promptCLIParam.ts` and `parseTargetCLIArgs.ts`: forward optional `theme?: SemanticTheme`, using `|prompt|${baseMessage}|reset|` in `promptCLIParam` instead of hardcoded `|bright_cyan|`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/requestChoiceMenu/ src/requestTerminalInput/ src/AcclimateCLI/runCLI/promptCLIParam/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/requestChoiceMenu/ src/requestTerminalInput/ src/AcclimateCLI/runCLI/promptCLIParam/ src/AcclimateCLI/runCLI/parseTargetCLIArgs.ts
git commit -m "feat: apply semantic theme and PromptIo support across menus and interactive prompts"
```

---

### Task 7: Wire per-stream themes, TTY overrides, `PromptIo`, and `ExecutionIoContext` into `tokenizeCLIInput`, `runCLI`, and `executeCLI`

**Files:**

- Modify: `src/AcclimateCLI/runCLI/tokenizeCLIInput/tokenizeCLIInput.ts`
- Modify: `src/AcclimateCLI/runCLI/runCLI.ts`
- Modify: `src/AcclimateCLI/executeCLI/executeCLI.ts`
- Test: `src/AcclimateCLI/runCLI/__tests__/runCLI.options.test.ts`
- Test: `src/AcclimateCLI/runCLI/__tests__/runCLI.positional.test.ts`
- Test: `src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts`
- Test: `src/AcclimateCLI/runCLI/__tests__/runCLI.errors.test.ts`
- Test: `src/AcclimateCLI/executeCLI/__tests__/executeCLI.unit.test.ts`
- Test: `src/AcclimateCLI/executeCLI/__tests__/executeCLI.subprocess.test.ts`

- [ ] **Step 1: Add failing tests for per-stream color detection, `isStdoutTTY`/`isStderrTTY`, `promptIo`, and plain-mode help/usage**

- In `src/AcclimateCLI/runCLI/__tests__/runCLI.help.test.ts`, add a test asserting `runCLI` omits ANSI escapes on redirected `stdout`, `NO_COLOR=1`, and `TERM=dumb`, and emits themed ANSI help when `isStdoutTTY: true` and `env: {}`.
- In `src/AcclimateCLI/executeCLI/__tests__/executeCLI.unit.test.ts`, add tests covering:
  - `args` alias, `isStdoutTTY`, `isStderrTTY`, `promptIo`, and custom `theme`.
  - Redirected `stderr`, `NO_COLOR=1`, and `TERM=dumb` emit zero ANSI escapes across error header, indented warning hint, AND attached command usage.
  - TTY `stderr` (`isStderrTTY: true`, `env: {}`) emits bright-red error, bright-yellow warning hint, and themed usage.
- In `src/AcclimateCLI/executeCLI/__tests__/executeCLI.subprocess.test.ts`, verify piped `--help` stdout and piped unknown-flag stderr contain zero ANSI escape codes (`not.toContain("\x1b[")`), and verify `NO_COLOR=1` and `TERM=dumb` stay plain.
- Update the two legacy dark-red `|red|This value is required.|reset|` assertions in `runCLI.options.test.ts` and `runCLI.positional.test.ts` to `|error|This value is required.|reset|` (bright red `\x1b[91m`).

- [ ] **Step 2: Run tests to verify new assertions fail**

Run: `npx vitest run src/AcclimateCLI/runCLI/__tests__/ src/AcclimateCLI/executeCLI/__tests__/`
Expected: FAIL (piped help and error usage currently leak ANSI escapes; `isStdoutTTY`/`isStderrTTY`/`promptIo`/`theme`/`args` are not wired yet).

- [ ] **Step 3: Implement per-stream themes, TTY stream wrappers, `promptIo`, and `ExecutionIoContext` in `tokenizeCLIInput`, `runCLI`, and `executeCLI`**

- In `tokenizeCLIInput.ts`: accept optional `errorTheme?: SemanticTheme` and pass `theme: errorTheme` to every `attachCLIErrorHelpContext` call (and recursively across sub-command delegation).
- In `runCLI.ts`:
  - Extend `RunCLIOptions` with `isStdoutTTY?: boolean`, `isStderrTTY?: boolean`, `promptIo?: PromptIo`, and `theme?: ThemeInput`.
  - Wrap `stdout`/`stderr` with `{ write: (chunk) => stream.write(chunk), isTTY: override }` when `isStdoutTTY`/`isStderrTTY` is specified so `openTerminalSession` and color checks stay consistent without mutating caller streams.
  - Convert `promptIo` via `makeTerminalSessionFromPromptIo` when `terminal` is omitted.
  - Derive `stdoutTheme` and `stderrTheme` using `makeThemeFromOptions` bound to `effectiveStdout`/`effectiveStderr` and `env`.
  - Enter `ExecutionIoContext.run(...)` around tokenization, help writing (passing `theme: stdoutTheme`), interactive menu/prompt collection (passing `theme: stderrTheme` and `errorTheme: stderrTheme`), and `matchedState.action(parsedArgs)`.
- In `executeCLI.ts`:
  - Export `ExecuteCLIOptions` accepting `input?: readonly string[]`, `args?: readonly string[]`, `isStdoutTTY?: boolean`, `isStderrTTY?: boolean`, `promptIo?: PromptIo`, `theme?: ThemeInput` alongside existing options.
  - Compute `effectiveArgs = options.args ?? options.input ?? process.argv.slice(2)` and derive `stderrTheme` for `formatCLIError(error, { theme: stderrTheme })`.

- [ ] **Step 4: Run tests to verify all `runCLI` and `executeCLI` tests pass**

Run: `npx vitest run src/AcclimateCLI/runCLI/__tests__/ src/AcclimateCLI/executeCLI/__tests__/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/AcclimateCLI/runCLI/ src/AcclimateCLI/executeCLI/
git commit -m "feat: bind per-stream semantic themes, TTY overrides, PromptIo, and ExecutionIoContext in runCLI and executeCLI"
```

---

### Task 8: Upgrade `Acclimate` facade (`run`, `execute`, `theme`, `setTheme`, `resetTheme`, `print*`) and `src/index.ts` exports

**Files:**

- Modify: `src/Acclimate.ts`
- Modify: `src/index.ts`
- Modify: `examples/basic.ts`
- Create: `src/__tests__/acclimateRunAndTheme.integration.test.ts`

- [ ] **Step 1: Write failing integration tests in `src/__tests__/acclimateRunAndTheme.integration.test.ts`**

Cover every end-to-end PR 4 requirement:

1. `await Acclimate.run(cli, { args, stdout, stderr, env, isStdoutTTY, isStderrTTY })` returns `0` on success and `--help`, `1` on unknown flags / validation errors / thrown action errors, and `130` on `promptIo` Ctrl-C cancellation without mutating `process.exitCode` or calling `process.exit()`.
2. `Acclimate.execute(cli, options)` returns `Promise<number>` cleanly without touching `process.exitCode`.
3. Inside `.action()`, `Acclimate.writeJson`, `Acclimate.writeData`, `Acclimate.log`, `Acclimate.printSuccess`, `Acclimate.printInfo`, `Acclimate.printWarn`, `Acclimate.printError`, `Acclimate.theme`, and `Acclimate.requestChoice` automatically route through the injected `stdout`, `stderr`, `env`, `isStderrTTY`, `promptIo`, and `theme`, isolated across concurrent runs.
4. `NO_COLOR=1`, `TERM=dumb`, and redirected streams produce 100% escape-free plain text across help, errors, indented recovery hints, menus, and `Acclimate.print*` helpers while preserving text, emoji (`✅`, `ℹ️`, `⚠️`, `❌`, `❯`), and guidance.
5. `Acclimate.setTheme(...)` / `Acclimate.resetTheme()` customize `Acclimate.theme`, `Acclimate.print*`, `Acclimate.log`, and `Acclimate.run` when no per-call `theme` is passed, without affecting standalone `createTheme()`.

- [ ] **Step 2: Run integration test to verify it fails**

Run: `npx vitest run src/__tests__/acclimateRunAndTheme.integration.test.ts`
Expected: FAIL because `Acclimate.run` currently returns `void` and ignores options, and `execute`/`theme`/`createTheme`/`setTheme`/`resetTheme`/`print*` do not exist yet.

- [ ] **Step 3: Implement the upgraded `Acclimate` facade, update `src/index.ts`, and update `examples/basic.ts`**

- In `src/Acclimate.ts`:
  - Export `AcclimateRunOptions`, `AcclimateLogOptions`, `AcclimateStatusPrintOptions`, and `AcclimateErrorPrintOptions`.
  - Keep module-local `defaultPaletteOverrides: SemanticThemePaletteOverrides | undefined` managed exclusively by `Acclimate.setTheme` and `Acclimate.resetTheme`.
  - Implement `Acclimate.run(cli, options?): Promise<number>` delegating to `executeCLI`, assigning `process.exitCode` only when `setProcessExitCode === true` or when no execution IO/args boundary options (and no `onExitCode`) were injected.
  - Implement `Acclimate.execute(cli, options?): Promise<number>` delegating to `executeCLI` with `process.exitCode` untouched.
  - Implement `Acclimate.theme` (getter returning active `ExecutionIoContext.get()?.stderrTheme` or live `createTheme({ stream: process.stderr, env: process.env, palette: defaultPaletteOverrides })`).
  - Implement `Acclimate.createTheme`, `Acclimate.setTheme`, `Acclimate.resetTheme`.
  - Implement `Acclimate.printSuccess`, `Acclimate.printInfo`, `Acclimate.printWarn`, `Acclimate.printError`, plus `ExecutionIoContext`-aware `Acclimate.log`, `Acclimate.writeData`, `Acclimate.writeJson`, `Acclimate.requestInput`, and `Acclimate.requestChoice`.
- In `src/index.ts`: export all new public runtime symbols and types explicitly (no `export *`).
- In `examples/basic.ts`: update final line to `await Acclimate.run(cli);` so ESLint `no-floating-promises` passes cleanly.

- [ ] **Step 4: Run integration and existing tests to verify they pass**

Run: `npx vitest run src/__tests__/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Acclimate.ts src/index.ts examples/basic.ts src/__tests__/acclimateRunAndTheme.integration.test.ts
git commit -m "feat: add semantic theme facade, status helpers, and injectable Acclimate.run/execute APIs"
```

---

### Task 9: Update documentation and run full build/test/type/lint verification

**Files:**

- Create: `docs/semantic-theming-and-io.md`
- Modify: `docs/interactive-prompts.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/semantic-theming-and-io.md` and update `docs/interactive-prompts.md` and `README.md`**

- Document the 10 semantic roles, dark-terminal bright palette, plain-mode rules (`NO_COLOR`, `TERM=dumb`, redirected streams), `createTheme` / `Acclimate.theme` / `Acclimate.setTheme` / `Acclimate.print*`, and injectable `Acclimate.run` / `Acclimate.execute` / `executeCLI` / `PromptIo` / `ExecutionIoContext`.
- Update `README.md` API list, usage examples (showing `await Acclimate.run(cli, ...)` and semantic theming), and mark the semantic print and `setTheme` To-Do items complete.

- [ ] **Step 2: Run full verification suite**

Run: `npm run format && npm run type && npm run lint && npm test && npm run build`
Expected: All commands exit 0 with zero errors or warnings.

- [ ] **Step 3: Commit docs and formatting updates**

```bash
git add docs/semantic-theming-and-io.md docs/interactive-prompts.md README.md
git commit -m "docs: document semantic theming, status helpers, and injectable execution IO"
```
