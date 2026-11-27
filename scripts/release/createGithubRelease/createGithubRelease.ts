import { extractChangelogSection } from "../extractChangelogSection/extractChangelogSection";
import type { GitRunner } from "../releaseCommits/releaseCommits";

/** Everything `createGithubRelease` touches, injected for testing. */
export type CreateGithubReleaseDeps = {
  readPackageJson: () => Promise<{ name: string; version: string }>;
  readChangelog: () => Promise<string>;
  isPublished: (params: { name: string; version: string }) => Promise<boolean>;
  runGit: GitRunner;
  /** Runs `gh`; rejects when the command exits non-zero. */
  runGh: GitRunner;
  log: (message: string) => void;
};

/** What a run decided to do. */
export type CreateGithubReleaseResult =
  | { kind: "created"; tag: string }
  | { kind: "already-exists"; tag: string }
  | { kind: "not-published"; tag: string };

async function _releaseExists(deps: CreateGithubReleaseDeps, tag: string) {
  return deps
    .runGh(["release", "view", tag])
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
}

async function _findVersionCommit(
  deps: CreateGithubReleaseDeps,
  version: string,
): Promise<string> {
  const output = await deps.runGit([
    "log",
    "-1",
    "--format=%H",
    `-S"version": "${version}"`,
    "--",
    "package.json",
  ]);
  return output.trim() === "" ? "HEAD" : output.trim();
}

/**
 * Creates the `v<version>` tag and GitHub release for the version in
 * package.json, with the changelog section as the notes. Safe to run on every
 * push: it does nothing unless the version is on npm and has no release yet.
 *
 * This exists because the Changesets action only creates releases when it
 * sees `New tag:` lines in the publish output, which changesets CLI 3 no
 * longer prints, so the action reports nothing published and skips the
 * release. Creating the release with `gh` removes that dependency.
 */
export async function createGithubRelease(
  deps: CreateGithubReleaseDeps,
): Promise<CreateGithubReleaseResult> {
  const { name, version } = await deps.readPackageJson();
  const tag = `v${version}`;
  if (!(await deps.isPublished({ name, version }))) {
    deps.log(`${name}@${version} is not on npm yet: no release to create.`);
    return { kind: "not-published", tag };
  }
  if (await _releaseExists(deps, tag)) {
    deps.log(`Release ${tag} already exists.`);
    return { kind: "already-exists", tag };
  }
  const notes = extractChangelogSection({
    changelog: await deps.readChangelog(),
    version,
  });
  await deps.runGh([
    "release",
    "create",
    tag,
    "--target",
    await _findVersionCommit(deps, version),
    "--title",
    tag,
    ...(notes === undefined ? ["--generate-notes"] : ["--notes", notes]),
  ]);
  deps.log(`Created release ${tag}.`);
  return { kind: "created", tag };
}
