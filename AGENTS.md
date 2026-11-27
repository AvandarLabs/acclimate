# Agent Rules

## Stack

- `@avandar/acclimate` is a lightweight TypeScript framework library for
  building type-safe command-line interfaces on Node.js (`>=18`). There is no
  browser or UI framework layer.
- Source lives in `src/` as ESM TypeScript (`"type": "module"`). `tsup` bundles
  `src/index.ts` into dual ESM (`dist/index.js`) and CJS (`dist/index.cjs`)
  outputs plus `.d.ts` declarations targeting `node18`.
- Tooling: `npm` for package management, `vitest` for tests, `oxlint` for
  linting, `oxfmt` for formatting (including import sorting), `tsc --noEmit`
  for type-checking, and `tsx` for running `examples/basic.ts`.
- Runtime dependencies stay minimal (`change-case`, `ts-pattern`).

## Documentation

- Use `docs/` for architectural notes, design decisions, functionality
  overviews, and checklists (for example `docs/<topic>.md`). These docs exist
  so future humans and LLMs can learn the codebase quickly without having to
  read all of the source.
- **Keep the docs current as you build. This is a rule, not a suggestion.**
  Whenever you add, change, or remove a feature, module, public API, data
  model, or architectural boundary, create or update the relevant file(s) in
  `docs/` as part of the same change. Treat updating the docs as part of the
  definition of done, not an afterthought.
  - New capability or subsystem: add or extend the `docs/` file that covers it.
  - Changed behavior, API, schema, or architecture: update the affected doc so
    it reflects reality. Do not leave stale descriptions behind.
  - Removed feature: delete or revise the parts of `docs/` that described it.
- Write docs at a high level: what a module or feature does, how the pieces fit
  together, and why the key decisions were made. Do not restate the code
  line by line.
- Before writing code, read the relevant files in `docs/` first (see
  "Implementation approaches").
- If Context7 MCP is configured, use it to reference the most up-to-date
  documentation of any library when you need it.

## Scope

- Only implement what is requested. Do not fix other bugs, clean up any other
  code, or do any refactors outside of what you were specifically asked to do.
- Only modify the files or directories that you are told to work on.
- If you absolutely must make modifications outside of the scope of
  files/directories you were told, then output a list of the files you changed
  that were outside of the requested scope of files. Include a 1-sentence
  explanation for each file about what changed.

## Implementation approaches

Before writing code:

- Determine which files in `docs/` are relevant to read.
- Determine which available skills are relevant. Run `npm run skills` to see
  what this project has installed.
- Determine which tests, if any, need to be written to test the requested
  functionality.

**Implement functionality using red/green TDD by default:**

1. **Red**: write a failing test that describes the desired behavior, and run
   it to confirm it fails for the expected reason before writing any
   implementation.
2. **Green**: write the minimum implementation needed to make the test pass,
   and run the test to confirm it passes.
3. **Refactor**: clean up the implementation while keeping the tests green.

As a rule, do not write implementation code before there is a failing test for
it. You may skip TDD only when writing a test adds no real value, for example:

- The change is trivial (e.g. copy tweaks, styling, renaming, config).
- The only test you could write would be redundant with existing coverage.
- The test would be tautological, asserting the implementation restates itself
  (e.g. simply checking that a variable is set, or that a hardcoded variable
  actually has the value we wrote).

When in doubt, write the test.

## Finishing a plan

When a plan is implemented, in this order, without waiting to be asked:

1. **Resolve loose ends:** finish straggling tasks and get open questions
   answered.
2. **Run `/avandar-code-review`** across the branch. Fix every violation,
   re-run the checks in "Build, test, lint", and **commit the fixes**.
3. **Run the full `/diff-review`** (never walkthrough-only mode) once step 2 is
   committed and green. Copy the walkthrough Markdown it produces to
   `docs/code-walkthroughs/{YYYY-MM-DD}_<milestone>-<plan-slug>.md` (for
   example `2026-11-20_m0-test-rig.md`; omit the milestone when there is none)
   and **commit it**. Never commit walkthrough PDFs.

Do not ask for full-branch review before step 3 is committed, and do not merge
without approval.

### Status checklist

End every phase of work (spec, plan, implementation, loose ends, code review,
walkthrough) with this checklist so the user can see where things stand on
returning. Use `✅` for done and `[ ]` for not done. The last item stays `❌`
until all six above it are `✅`, then becomes `👍`: that `👍` means the branch
is ready for review and nothing is pending.

```markdown
- ✅ Spec written
- ✅ Plan written
- [ ] Full plan implemented
- [ ] Resolved loose ends
- [ ] Finished avandar code review
- [ ] Produced code walkthrough
- ❌ Ready for full-branch review, awaiting approval
```

## Build, test, lint

Node.js 18 or newer and npm are the prerequisites.

```sh
npm install             # install dependencies
npm run build           # bundle ESM + CJS and .d.ts into dist/ with tsup
npm run dev             # build in watch mode with tsup
npm run demo            # run examples/basic.ts with tsx
npm run type            # run the TypeScript compiler without emitting
npm test                # run the test suite with vitest
npm run test:watch      # run vitest in watch mode
npm run lint            # lint with oxlint
npm run lint:fix        # lint and auto-fix with oxlint
npm run format          # format files with oxfmt
npm run format:check    # check formatting with oxfmt without writing
```

Run `npm run type`, `npm run lint`, `npm test`, and `npm run build` before
committing or finishing a task.

## Comments

- Do not use em dashes. Prefer a colon for explanations, or a hyphen (-) as a
  short dash for aside explanations where you would have used an em dash.
- Use block comments or docstrings to document exported or public interfaces,
  constants, objects, functions, and classes.

## Naming conventions

- Follow naming conventions for the language you are using.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`,
  `hasError`).
- Avoid abbreviated names, such as `val`, and use the full word `value`, unless
  that would cause a naming collision with another variable in scope.
- Avoid vague names like `next`, `prev`, or `n` that do not say what the
  variable actually holds. Always include a noun, such as `nextToken`,
  `prevArg`, or `numOptions`.
- Builder functions for objects or classes should be named `create{Type}`.
  E.g. `createCli`.
- Builder functions for strings or primitives should be named `build{Thing}`.
  E.g. `buildUsageLine`.
- Builder functions that take some seed data to build an output should use the
  `*From{Seed}` format. E.g. `createStateFromConfig` or `buildKeyFromOption`.
- Conversion or cast functions should use "to". E.g. `optionToFlagLabel` or
  `tokenToValue`.

## Functions & Logic

- Keep functions short (<= 45 lines).
- Extract logic into utility functions if:
  - The function will be too long otherwise.
  - The logic will be reused.

## Language & framework rules

The rules for this project's language, runtime, and CLI design live in
`docs/rules/`:

- [See our TypeScript rules](docs/rules/typescript.md)
- [See our Node.js rules](docs/rules/node.md)
- [`docs/rules/cli-ux.md`](docs/rules/cli-ux.md): how Acclimate CLIs talk.
  Stdout is data and stderr is the conversation, every action is scriptable,
  missing values can be asked for on a terminal, every color is semantic, and
  exit codes are part of the interface.

## Agent skills

- This project's agent skills are managed by `npx skills` and recorded in
  `skills-lock.json`.
- **Never create or edit anything under `.agents/`, `.claude/skills/`,
  `.codex/`, `.cursor/skills/`, or `.opencode/`.** Those directories are
  generated and gitignored: `skills-lock.json` is the only skills file in git.
- Common commands (the wrapper lives in `scripts/skills`):
  - `npm run skills`: list installed project skills.
  - `npm run skills:install`: restore locked skills on a fresh clone.
  - `npm run skills:update`: update installed skills to their latest versions.
- To add or remove a skill, use `npx skills add` or `npx skills remove` and
  commit the resulting `skills-lock.json` change in the same commit.
- See [`docs/skills.md`](docs/skills.md) for full details on how project skills
  are structured and maintained.
