import type { CommitClassification } from "../commitClassification/commitClassification";

/** How far a change moves the package version. */
export type BumpLevel = "none" | "patch" | "minor" | "major";

const BUMP_RANK: Record<BumpLevel, number> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

/** Returns the highest level in the list, or `none` for an empty list. */
export function maxBumpLevel(levels: readonly BumpLevel[]): BumpLevel {
  return levels.reduce<BumpLevel>((highest, level) => {
    return BUMP_RANK[level] > BUMP_RANK[highest] ? level : highest;
  }, "none");
}

/**
 * Converts a Conventional Commit classification into a bump level: `feat` is
 * minor, `fix` and `perf` are patch, everything else does not release. A
 * breaking change is major, capped to minor while the major version is 0
 * (semver treats 0.x as unstable, so breaking changes ride minor bumps).
 */
export function classificationToBumpLevel(params: {
  classification: CommitClassification;
  currentMajorVersion: number;
}): BumpLevel {
  const { classification, currentMajorVersion } = params;
  if (classification.isBreaking) {
    return currentMajorVersion === 0 ? "minor" : "major";
  }
  if (classification.type === "feat") {
    return "minor";
  }
  if (classification.type === "fix" || classification.type === "perf") {
    return "patch";
  }
  return "none";
}
