# Node.js rules

These rules add to [`typescript.md`](typescript.md) for code that runs on
Node.js.

## Modules

- Source is ESM (`"type": "module"`). Never use `require` or `module.exports`
  in `src/`. `tsup` handles producing both ESM (`dist/index.js`) and CJS
  (`dist/index.cjs`) outputs for consumers.
- Import Node's built-ins with the `node:` prefix (`node:readline`,
  `node:fs/promises`, `node:path`) in new and modified code.
- Relative imports omit file extensions (for example
  `import { createCLI } from "./AcclimateCLI"`). `tsconfig.json` uses
  `moduleResolution: "bundler"` with `allowImportingTsExtensions: false`,
  ESLint enforces `import-x/extensions` (`never`), and `tsup` bundles
  `src/index.ts` to `dist/`.
- `tsconfig.json` and `vitest.config.ts` configure `@/*` -> `src/*`, but prefer
  clean relative imports inside `src/` so internal dependencies stay explicit.
- Type-only imports and exports must use `import type` / `export type`,
  enforced by `verbatimModuleSyntax: true` in `tsconfig.json`.

## Erasable syntax only

Write TypeScript that a type stripper can erase cleanly, so the source stays
compatible with `tsx`, `tsup`, and modern Node.js:

- No `enum`. Use a string literal union, or an `as const` object when runtime
  values are needed.
- No `namespace`.
- No constructor parameter properties (`constructor(private name: string)`).

## The process

- Keep process globals out of core library modules. Accept inputs, streams, and
  environment values as parameters (such as `runCLI({ cli, input })`) so
  modules stay deterministic and easy to unit-test.
- Never call `process.exit()` inside library code, which cuts off unflushed
  stdout/stderr and breaks callers embedding Acclimate. Prefer setting
  `process.exitCode` at the top-level execution boundary or surfacing a
  structured error.
- Never read or mutate `process.env` deep inside parsing or formatting helpers;
  read environment checks (such as `NO_COLOR`) at one clear boundary and pass
  derived flags down.
- Never leave a promise floating (enforced by ESLint
  `@typescript-eslint/no-floating-promises`). Every promise is awaited,
  returned, or explicitly handled.

## Errors

- Throw `Error` instances (or `CLIError` for user-facing argument, option, and
  usage errors), never strings or plain objects (enforced by ESLint
  `@typescript-eslint/only-throw-error`).
- When rethrowing, wrap and keep the original cause:
  `throw new Error("failed to parse config", { cause: error })`.
- Catch only where you can add context, render a clean user-facing CLI error,
  or recover.

## I/O

- Prefer Node's promise APIs (`node:fs/promises`, `node:readline/promises`)
  over callback APIs, and avoid synchronous I/O in library code.
- Join paths with `node:path`; never concatenate them with `/`.
- Use `pipeline` from `node:stream/promises` to connect streams so errors and
  backpressure propagate cleanly.

## Building and dependencies

- `npm run build` bundles `src/index.ts` to `dist/` (`dist/index.js`,
  `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`, and sourcemaps) with
  `tsup` targeting `node18`. `npm run type` runs `tsc -p tsconfig.json --noEmit`.
  The package's `exports`, `main`, `module`, `types`, and `files` point at
  `dist/`, never at `src/`.
- Support Node.js `>=18` (`engines.node`). Prefer what Node ships over adding
  third-party packages, and keep runtime dependencies minimal. Add a dependency
  only when it saves real work across supported Node versions, and justify why
  in the change that adds it.
