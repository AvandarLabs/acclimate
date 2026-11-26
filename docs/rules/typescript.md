# TypeScript rules

## General Code Style & Formatting

- Use JSDoc to document public types, objects, classes, and functions.
- **Use functional and declarative programming patterns.**
  - Avoid classes or imperative programming patterns unless an error subclass
    (such as `CliError`) or similar built-in requires one.
  - Use higher-order functions (`map`, `filter`, `reduce`).
  - Avoid `for` and `while` loops when a declarative transform is clearer.
- Use named exports instead of default exports.
- Keep lines and comments within 80 characters (enforced by ESLint `max-len`
  and Prettier `printWidth`).
- If a docstring fits in 80 characters, then single-line it. Example:

  ```ts
  /** My single-line comment less than 80 characters. */
  ```

- Never use single-line `if`s. Always use opening `{` and closing `}` even if
  there is only one statement to wrap. Examples:

  ```ts
  // Bad - inline if
  if (someCondition) doSomething();

  // Good - wrapped in braces
  if (someCondition) {
    doSomething();
  }
  ```

- Always use block bodies for arrow functions (enforced by ESLint
  `arrow-body-style`).
- Use string interpolation instead of concatenation. Examples:

  ```ts
  // Bad - concatenating with +
  const myString = "Hello, " + name;

  // Good - interpolation
  const myString = `Hello ${name}`;
  ```

## Naming Conventions

- Use PascalCase for types, classes, singleton class instances, or objects
  representing modules, namespaces, or static singletons (such as `Acclimate`).
- Use camelCase for variables, functions, and methods.
- Use UPPERCASE for environment variables or hard-coded constants.
- Event handlers and callbacks should be prefixed with `on` (e.g. `onError`)
  instead of `handle` (e.g. `handleError`).
- Prefix non-exported top-level helper functions with an underscore.
  Example:

  ```ts
  function _doSomething(): void {}

  export function exportedFunction(): void {
    _doSomething();
  }
  ```

- Naming exceptions:
  - `E2E` stays fully uppercased or fully lowercased (e.g. `e2eConfig` or
    `runE2ETest`).

## Types

- **Never** use `any`.
- Use `as const` for literals that never change.
- Use `type` instead of `interface`. **Only** use `interface` for OOP-style
  interfaces implemented by a class.
- Use `undefined` instead of `null`. Only use `null` when required by an
  external API or protocol (such as JSON serialization).
- Use string literal unions instead of `enum`.
- Encapsulate data in composite types when a type, or parts of a type, need to
  be reused.
- Do not create a new type if the type is never reused. Reduce indirection.
  Example:

  ```ts
  // Bad - unnecessary indirection for one-off internal types
  type FormatParams = {
    name: string;
    usage: string;
  };

  type FormatReturn = {
    output: string;
  };

  export function formatCommand(params: FormatParams): FormatReturn {
    return { output: `${params.name}: ${params.usage}` };
  }
  ```

- If an object has >= 4 properties, extract it to its own type for readability.
  Example:

  ```ts
  // Bad - too many inline properties, difficult to read
  export function formatHelp(options: {
    name: string;
    description: string;
    usage: string;
    showDefaults: boolean;
  }): { text: string } {
    return { text: `${options.name}: ${options.usage}` };
  }

  // Good - large object extracted to its own type
  type FormatHelpOptions = {
    name: string;
    description: string;
    usage: string;
    showDefaults: boolean;
  };

  export function formatHelp(options: FormatHelpOptions): { text: string } {
    return { text: `${options.name}: ${options.usage}` };
  }
  ```

### When to explicitly annotate types

- Declare types for variables, functions, parameters, and return values at
  module boundaries and top-level declarations (enforced at module boundaries
  by ESLint `@typescript-eslint/explicit-module-boundary-types`).
  - Avoid redundant annotations for local variables inside a function.
  - Avoid redundant annotations for nested arrow functions (e.g. inline
    callbacks).

  For example:

  ```ts
  // Good - explicit types at module boundaries and top-level declarations
  export const DEFAULT_EXIT_CODE: number = 0;

  export function formatFlagNames(flags: readonly string[]): string[] {
    const trimmed = flags.map((flag) => {
      return flag.trim();
    });
    return trimmed;
  }

  // Bad - redundant local and callback annotations
  export function formatFlagNamesBad(flags: readonly string[]): string[] {
    const count: number = flags.length;
    return flags.map((flag: string): string => {
      return `${flag} (${count})`;
    });
  }
  ```

## Functions

- Use default parameter values instead of null/undefined checks.
- Use RO-RO (Receive Object, Return Object) for passing and returning multiple
  parameters.
  - If there is only one parameter, do not wrap it in an object.
  - If wrapping parameters in an object, name the parameter `options` unless
    `params` or `config` is more appropriate in context.
  - If you use an object, use an inline type annotation unless it has >= 4
    properties or will be reused.

    Examples:

    ```ts
    // Good - single argument passed directly
    function normalizeFlag(flagName: string): string {
      return flagName.trim();
    }

    // Good - small options object with inline type
    function buildUsage(options: { name: string; command: string }): string {
      return `${options.name} ${options.command}`;
    }

    // Good - reused parameters extracted to a type alias
    type OptionSpec = {
      name: string;
      description: string;
    };

    function formatOption(options: Readonly<OptionSpec>): string {
      return `${options.name}: ${options.description}`;
    }
    ```

- Top-level functions should always use the `function` keyword. Nested
  functions (inside a function or as an object property) should always be arrow
  functions.

  Examples:

  ```ts
  // Good - `function` at top level and arrow function inside
  export function collectOptionNames(flags: readonly string[]): string[] {
    const stripPrefix = (flag: string) => {
      return flag.replace(/^-+/, "");
    };
    return flags.map(stripPrefix);
  }

  // Good - arrow function for object property
  export const FlagUtils = {
    isFlag: (token: string): boolean => {
      return token.startsWith("-");
    },
  };
  ```

### Import/export declarations

- Type imports and exports must always use the `type` keyword (enforced by
  `verbatimModuleSyntax: true` in `tsconfig.json`):

  ```ts
  import type { CliOptionParam } from "./AcclimateCli.types";

  export type { CliOptionParam } from "./AcclimateCli.types";
  ```

- Relative imports omit file extensions (enforced by `tsconfig.json` and
  ESLint `import-x/extensions`).
- Import ordering is managed by Prettier
  (`@ianvs/prettier-plugin-sort-imports`).

## File, Directory, and Module Conventions

- When a module cannot be encapsulated in a single file (for example when it
  has a `.test.ts` file or tightly-coupled helpers), create a directory with
  the same name to group them:

  ```plaintext
  generateHelpText/
    generateHelpText.ts
    generateHelpText.test.ts
  ```

- Keep `src/index.ts` as the package's public barrel entry point. Avoid adding
  new monolithic or unnecessary barrel files in internal directories (existing
  module `index.ts` files can remain untouched unless refactored as part of
  scoped work).
- Never use namespace re-exports (`export * from ...`). Always use explicit
  named exports (`export { createCli } from ...`).
- All exported classes, objects, and functions must have a JSDoc docstring.

  ```ts
  /**
   * Format a CLI option signature for help output.
   *
   * @param options The option details.
   * @param options.name The flag name (for example `--verbose`).
   * @param options.required Whether the option is required.
   * @returns Formatted option signature.
   */
  export function formatOptionSignature(options: {
    name: string;
    required: boolean;
  }): string {
    return options.required ? options.name : `[${options.name}]`;
  }
  ```

- If an object is exported, its top-level methods should also have docstrings:

  ```ts
  /** Public helpers for formatting terminal output. */
  export const TerminalOutput = {
    formatOptionSignature,

    /** Return a plain newline-terminated line. */
    formatLine: (text: string): string => {
      return `${text}\n`;
    },
  };
  ```

## Immutability

- Follow **input contravariance, output covariance**: widen inputs, narrow
  outputs.
- Wrap inputs at module boundaries as readonly so callers retain control of
  their data; return mutable types so callers retain control of what you give
  them.
- Locally, prefer mutable types. They are faster in V8 and immutability is not
  a dogmatic goal: it is about establishing a clear contract at the boundary.

### When to use readonly wrappers

- Apply readonly wrappers to function parameters.
- Everywhere else, use mutable types (local variables, internal helpers,
  return types, intermediate values).
- Functions that intentionally mutate their input (e.g. `sortInPlace`,
  `assignDefaults`) are the exception: drop the readonly wrapper on the
  parameter they mutate, name them so the mutation is obvious, and prefer
  returning `void`.

```ts
// Good: readonly input, mutable locally, mutable output
export function getRequiredOptionNames(
  options: readonly CliOptionParam[],
): string[] {
  const names: string[] = [];
  options.forEach((option) => {
    if (option.required) {
      names.push(option.name);
    }
  });
  return names;
}

// Good: mutable input because mutation is explicit
export function sortInPlace(items: string[]): void {
  items.sort();
}

// Bad: readonly return restricts the caller unnecessarily
export function getFlags(config: Readonly<Config>): readonly string[] {}

// Bad: mutable input lets the function mutate caller data
export function getFlags(items: string[]): string[] {}
```

### How to make a type readonly

| Kind   | Use                      |
| ------ | ------------------------ |
| Array  | `readonly T[]`           |
| Set    | `ReadonlySet<T>`         |
| Map    | `ReadonlyMap<K, V>`      |
| Object | `Readonly<T>`            |
| Record | `Readonly<Record<K, V>>` |

For objects, prefer the `Readonly<T>` wrapper over annotating every property
with `readonly`. Use per-property `readonly` only when **some** properties are
readonly and others are not.

```ts
// Good: wrapper at the call site
export function formatHelp(config: Readonly<HelpConfig>): string {}

// Good: per-property readonly when mixing
type CommandConfig = {
  readonly name: string;
  description: string;
};

// Bad: per-property readonly when all are readonly. Use Readonly<> instead.
type HelpConfig = {
  readonly title: string;
  readonly usage: string;
};
```

### Type aliases stay mutable

Define type aliases as mutable. Apply `Readonly<T>` or `readonly` at the
function signature, not on the alias itself. A reusable type should not impose
immutability on every consumer.

```ts
// Good: mutable alias, readonly applied at the boundary
type ParsedArg = { name: string; value: string };

export function formatArg(arg: Readonly<ParsedArg>): string {
  return `${arg.name}=${arg.value}`;
}

export function clearArgValue(arg: ParsedArg): void {
  arg.value = "";
}
```

Only bake `readonly` into the alias itself when the type **must never** be
mutated anywhere (for example a frozen constant or an immutable event record).

```ts
// Good: type must always be immutable
type ParseEvent = Readonly<{
  timestamp: number;
  command: string;
  rawArgs: readonly string[];
}>;
```

## Validation

- Explicitly validate data that crosses a trust boundary: CLI arguments,
  interactive terminal input, environment variables, files, and parsed JSON.
- Keep runtime dependencies minimal: use Acclimate's own parameter parsers,
  validators, and explicit TypeScript type guards rather than adding heavy
  validation libraries unless justified.
