import { classificationToBumpLevel } from "./bumpLevel";
import { subjectToClassification } from "./commitClassification";
import type { BumpLevel } from "./bumpLevel";

/** Runs a git command and resolves to its stdout. */
export type GitRunner = (args: readonly string[]) => Promise<string>;

/** One first-parent commit on main, with the changes it brought in. */
export type ReleaseCommit = {
  sha: string;
  shortSha: string;
  subject: string;
  files: string[];
  diff: string;
};

/** A commit that may deserve a release note. */
export type ReleaseCandidate = ReleaseCommit & {
  /** Undefined when the subject carries no type, so the model decides. */
  knownBump: BumpLevel | undefined;
};

const RELEASE_COMMIT_PREFIX = "Release: @avandar/acclimate";
const VERSION_PR_BRANCH = "changeset-release/";
const SHIPPED_DIRECTORY = "src/";
const SHORT_SHA_LENGTH = 7;

/** True when the subject belongs to the version PR rather than real work. */
export function isReleaseBookkeepingSubject(subject: string): boolean {
  return (
    subject.startsWith(RELEASE_COMMIT_PREFIX) ||
    subject.includes(VERSION_PR_BRANCH)
  );
}

/** True when a file is part of the published bundle, not a test. */
export function isShippedFile(path: string): boolean {
  return (
    path.startsWith(SHIPPED_DIRECTORY) &&
    !path.includes("__tests__/") &&
    !path.endsWith(".test.ts")
  );
}

/**
 * Keeps commits that could change the published package: they touch shipped
 * files, are not release bookkeeping, and are either unclassified or of a
 * releasing type (feat, fix, perf, or breaking).
 */
export function selectReleaseCandidates(params: {
  commits: readonly ReleaseCommit[];
  currentMajorVersion: number;
}): ReleaseCandidate[] {
  const { commits, currentMajorVersion } = params;
  return commits.flatMap((commit) => {
    if (
      isReleaseBookkeepingSubject(commit.subject) ||
      !commit.files.some(isShippedFile)
    ) {
      return [];
    }
    const classification = subjectToClassification(commit.subject);
    const knownBump =
      classification === undefined
        ? undefined
        : classificationToBumpLevel({ classification, currentMajorVersion });
    return knownBump === "none" ? [] : [{ ...commit, knownBump }];
  });
}

/**
 * Finds the ref the next release starts from: the nearest `v*` tag, or, for a
 * repo that has never been tagged, the last commit that changed the
 * `version` field in package.json.
 */
export async function findReleaseAnchor(
  runGit: GitRunner,
): Promise<string | undefined> {
  const tag = await runGit([
    "describe",
    "--tags",
    "--abbrev=0",
    "--match",
    "v*",
  ])
    .then((output) => {
      return output.trim();
    })
    .catch(() => {
      return "";
    });
  if (tag !== "") {
    return tag;
  }
  const versionCommit = await runGit([
    "log",
    "-1",
    "--format=%H",
    "-G",
    '"version":',
    "--",
    "package.json",
  ]);
  return versionCommit.trim() === "" ? undefined : versionCommit.trim();
}

async function _readCommitFiles(
  runGit: GitRunner,
  sha: string,
): Promise<string[]> {
  const output = await runGit(["diff", "--name-only", `${sha}^1`, sha]).catch(
    () => {
      return runGit(["show", "--name-only", "--pretty=format:", sha]);
    },
  );
  return output.split("\n").filter((line) => {
    return line.trim() !== "";
  });
}

async function _readCommitDiff(
  runGit: GitRunner,
  sha: string,
  charBudget: number,
): Promise<string> {
  const diff = await runGit([
    "diff",
    `${sha}^1`,
    sha,
    "--",
    "src",
    ":!*.test.ts",
    ":!**/__tests__/**",
  ]).catch(() => {
    return "";
  });
  return diff.length > charBudget
    ? `${diff.slice(0, charBudget)}\n[diff truncated]`
    : diff;
}

/**
 * Lists the first-parent commits on HEAD since the anchor (oldest first).
 * First-parent keeps one entry per merged branch, and diffing each commit
 * against its first parent gives a merge's whole contribution.
 */
export async function collectReleaseCommits(params: {
  runGit: GitRunner;
  anchor: string | undefined;
  diffCharBudget: number;
}): Promise<ReleaseCommit[]> {
  const { runGit, anchor, diffCharBudget } = params;
  const range = anchor === undefined ? "HEAD" : `${anchor}..HEAD`;
  const output = await runGit([
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H%x09%s",
    range,
  ]);
  const entries = output.split("\n").filter((line) => {
    return line.includes("\t");
  });
  return Promise.all(
    entries.map(async (line) => {
      const [sha = "", subject = ""] = line.split("\t");
      return {
        sha,
        shortSha: sha.slice(0, SHORT_SHA_LENGTH),
        subject,
        files: await _readCommitFiles(runGit, sha),
        diff: await _readCommitDiff(runGit, sha, diffCharBudget),
      };
    }),
  );
}
