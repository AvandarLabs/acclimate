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

```sh
# List skills installed for this project
npx skills list

# Restore skills from skills-lock.json on a fresh clone
npx skills experimental_install

# Update project skills to their latest versions
npx skills update
```

Install and update are intentionally separate: restoring from
`skills-lock.json` materializes the locked skill set, while `npx skills update`
deliberately upgrades skills to newer upstream versions.

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
