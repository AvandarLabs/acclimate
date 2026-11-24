# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets)
and two GitHub Actions workflows. Nobody runs `npm publish` by hand.

## Flow

1. Work lands on `main`. A change that should ship carries a changeset: run
   `npm run changeset`, pick the bump (`patch`, `minor`, `major`), and write a
   user-facing summary. Commit the generated `.changeset/*.md` file. Changes
   with no changeset (docs, CI, tests) never trigger a release.
2. On every push to `main`, `.github/workflows/release.yaml` runs the checks
   and the Changesets action. While changesets are pending it opens or updates
   a **Release: @avandar/acclimate** PR that bumps `package.json` and writes
   `CHANGELOG.md`.
3. Merging that PR runs the workflow again. With no changesets pending, the
   action runs `npm run release` (build, then `changeset publish`), which
   publishes to npm, pushes a `v<version>` tag, and creates a GitHub release
   with notes taken from the changelog.

`.github/workflows/ci.yaml` runs type-check, lint, tests, and build on every PR
and push to `main`.

## Why these choices

- **Trusted publishing, no npm token.** The release job has `id-token: write`
  and npm exchanges its GitHub identity for a short-lived token, so there is no
  long-lived secret to leak or rotate. This requires the workflow filename
  (`release.yaml`) to match the trusted publisher configured on npmjs.com.
  Provenance is enabled, which needs `repository.url` in `package.json` to match
  the GitHub repo.
- **Human gate.** Only merging the version PR publishes.
- **Changelog via `@changesets/changelog-github`.** Entries link the PR and
  author, and feed the GitHub release notes.

## Gotchas

- The version PR is created by `GITHUB_TOKEN`, so GitHub does not run `ci.yaml`
  on it. This is fine because `release.yaml` already gates on the same checks
  before it opens the PR and before it publishes.
- Releases are versioned by Changesets only. Do not edit `version` in
  `package.json` by hand.
