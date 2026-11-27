# Releasing

Releases are fully automated. Push to `main` as usual; when you want to ship,
merge the version PR. Nobody edits `package.json` or runs `npm publish`.

## Flow

1. Work lands on `main`. No release bookkeeping.
2. On every push to `main`, `.github/workflows/release.yaml` runs the checks,
   then `npm run release:changesets` (`scripts/release/`), which writes
   `.changeset/auto-*.md` files for everything merged since the last release.
   The Changesets action then opens or updates a **Release:
   @avandar/acclimate** PR that bumps `package.json` and writes
   `CHANGELOG.md`.
3. Merging that PR runs the workflow again. The current version is not on npm
   yet, so no changesets are generated and the Changesets action runs
   `npm run release` (build, then `changeset publish`) to publish to npm. A
   final step, `npm run release:github` (`scripts/release/`), then creates the
   `v<version>` tag and the GitHub release with the changelog section as its
   notes. That step is idempotent: it does nothing unless the version is on npm
   and has no release yet, so it also repairs a release that failed earlier.

`.github/workflows/ci.yaml` runs type-check, lint, tests, and build on every
push to any branch (not the version branch, see Gotchas).

## How the version is chosen

`scripts/release/` reads the first-parent commits on `main` since the last
release (the nearest `v*` tag, or for an untagged repo the last commit that
changed `version` in `package.json`). Each commit is classified by its subject:

| Source                           | Example                                 | Result                                         |
| -------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Conventional Commit header       | `feat: add menus`, `fix(parser): crash` | `feat` minor, `fix` and `perf` patch           |
| Branch prefix in a merge subject | `Merge jpsyx/feat/semantic-theme`       | Same mapping by prefix                         |
| Breaking marker                  | `feat!: drop old api`                   | Major, capped to minor while major is 0        |
| Anything else                    | `updated readme`                        | The model decides: patch or minor, never major |

Commits that do not touch shipped source (`src/`, excluding tests), and
`docs`, `test`, `chore`, `ci`, `build`, `style`, and `refactor` commits, never
cause a release. The release bump is the highest of the notes' bumps. The model
can never override a bump that the subject or branch already determined, and
only an explicit `!` can produce a major.

## How the release notes are written

One Anthropic Messages API call (model set in `scripts/release/releaseConfig.ts`)
receives each candidate commit's subject, files, and a truncated diff of the
shipped source. It returns one short user-facing note per change, merging
related commits and omitting changes invisible to library users. Each note
becomes one changeset, so the changelog and GitHub release group them by bump.

If `ANTHROPIC_API_KEY` is missing or the call fails, the release still
proceeds with plain notes built from commit subjects.

## Overriding by hand

Add a changeset yourself with `npm run changeset` when you want exact wording
or a bump the commits do not imply. While any hand-written `.changeset/*.md`
exists, automatic generation is skipped and the release uses yours.

## Why these choices

- **Trusted publishing, no npm token.** The release job has `id-token: write`
  and npm exchanges its GitHub identity for a short-lived token. This requires
  the workflow filename (`release.yaml`) to match the trusted publisher on
  npmjs.com. Provenance needs `repository.url` in `package.json` to match the
  GitHub repo.
- **Human gate.** Only merging the version PR publishes.
- **Bump is deterministic, text is generative.** Version numbers come from
  rules a reader can audit; the model only phrases the notes.
- **Uncommitted generated changesets.** They are rebuilt every run and consumed
  into the version PR, so `main` never carries release bookkeeping.

## Gotchas

- **Why GitHub releases are created by our own step.** The Changesets action
  creates releases only when the publish output contains `New tag:` lines.
  changesets CLI 3 no longer prints them, so the action reports nothing
  published, skips the tag push and the release, and `createGithubReleases` is
  therefore turned off. If the action ever works again, `release:github` sees
  the release exists and skips. `GITHUB_TOKEN` with `contents: write` is all it
  needs: there is no setting to enable Releases and no extra secret.
- **The registry lags right after a publish.** `release:github` retries the
  npm lookup for about a minute before concluding the version is not on npm.
  Without that, the step ran seconds after `changeset publish`, saw a 404, and
  skipped the tag and release.
- **`ANTHROPIC_API_KEY` is only for the note text.** Publishing to npm and
  creating the release never use it. Without it the notes fall back to commit
  subjects.
- **No CI run on the version PR.** CI triggers on `push`, not `pull_request`.
  The version PR is opened by github-actions[bot], and a `pull_request` run
  for it fails at startup with no jobs (a permanent red X; re-running it as a
  human passes). Bot pushes made with `GITHUB_TOKEN` do not trigger `push`
  workflows, so the version PR simply has no CI check. `release.yaml` already
  runs the same checks before opening it and before publishing. The cost: PRs
  from forks do not run CI.
- Do not make `check` a required status check on `main` unless the version PR
  is exempt: with no CI run it would never be satisfied.
- Do not edit `version` in `package.json` by hand.
- A tracked `pnpm-lock.yaml` makes Changesets call `pnpm`, which CI does not
  have. `wt` creates one in new worktrees, so it is gitignored.
