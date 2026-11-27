# Agent skills

This repository ships a curated set of agent skills so every coding agent
working on `@avandar/acclimate` starts with the same conventions, review
workflows, and TypeScript/Node.js guidance. This document explains how skills
are installed, tracked, and updated.

## How skills are managed

Project skills are managed solely by **`npx skills`** and declared in
`skills-lock.json`.

- `npx skills` installs the canonical skill folders into `.agents/skills/`.
- It wires per-frontend entries (such as symlinks under `.claude/skills/`) for
  supported agent frontends (`claude-code`, `cursor`, `opencode`, `codex`).
- Never create or edit files or symlinks under `.agents/`, `.claude/skills/`,
  `.codex/`, `.cursor/skills/`, or `.opencode/` by hand. Let `npx skills` own
  those layouts so they do not drift.

## What git tracks

**Only `skills-lock.json` is tracked in git.**

All generated skill directories and per-frontend links/config are gitignored:

- `.agents/`
- `.claude/skills/`
- `.claude/settings.local.json`
- `.codex/`
- `.cursor/agents/`
- `.cursor/hooks.json`
- `.cursor/skills/`
- `.opencode/`

`skills-lock.json` is the manifest of what this repository expects on disk.

## Common commands

A small wrapper under `scripts/skills/` (built on Acclimate itself) gives one
place to ask what is installed and one place to bring it up to date:

```sh
npm run skills           # list every skill, flagging any missing from disk
npm run skills:install   # install locked skills that are not on disk yet
npm run skills:update    # update every skill to its latest version
```

- `skills:install` only adds what `skills-lock.json` asks for and is missing,
  the way `npm install` does for packages. It never re-resolves an installed
  skill.
- `skills:update` runs `scripts/skills/update-skills.sh`, a plain shell script
  on purpose: it runs `npx skills update`, then updates each skill listed in
  its `SELF_INSTALLING_SKILLS` variable through that skill's own CLI. The list
  is empty here because every skill is managed by `npx skills`.
- There is deliberately no `postinstall` hook: this package is published, and a
  `postinstall` script would run on every consumer's install. Run
  `npm run skills:install` after a fresh clone.
- The raw `npx skills list`, `npx skills experimental_install`, and
  `npx skills update` commands still work and are what the wrapper calls.

## Adding or removing skills

Always change the project skill set through `npx skills`, never by hand-editing
`skills-lock.json` or `.agents/skills/`:

```sh
# Add a skill for all configured agent frontends
npx skills add <owner>/<repo> --skill <name> \
  --agent claude-code cursor opencode codex --full-depth -y

# Remove a skill
npx skills remove <name>
```

Both commands update `skills-lock.json`. Commit the updated `skills-lock.json`
in the same commit so every other clone and worktree stays in sync.
