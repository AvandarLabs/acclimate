/** The type and breaking flag read from a commit subject or branch name. */
export type CommitClassification = {
  type: string;
  isBreaking: boolean;
};

const KNOWN_COMMIT_TYPES: readonly string[] = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "chore",
  "docs",
  "test",
  "ci",
  "build",
  "style",
];

const CONVENTIONAL_TITLE_PATTERN = /^([a-z]+)(?:\([^)]+\))?(!)?:\s+\S/;
const PULL_REQUEST_MERGE_PATTERN =
  /^Merge pull request #\d+ from [^/\s]+\/(\S+)/;
const LOCAL_MERGE_PATTERN = /^Merge (?:branch )?'?([^\s']+)'?/;

/**
 * Parses a Conventional Commit header (`type(scope)!: description`). Returns
 * undefined when the subject does not match or the type is not recognized.
 */
export function parseConventionalCommitTitle(
  title: string,
): CommitClassification | undefined {
  const match = CONVENTIONAL_TITLE_PATTERN.exec(title.trim());
  const type = match?.[1];
  if (type === undefined || !KNOWN_COMMIT_TYPES.includes(type)) {
    return undefined;
  }
  return { type, isBreaking: match?.[2] === "!" };
}

/**
 * Finds the commit type in a branch name by taking its first recognized path
 * segment, so `jpsyx/feat/thing` and `feat/thing` both yield `feat`.
 */
export function branchNameToCommitType(branchName: string): string | undefined {
  return branchName.split("/").find((segment) => {
    return KNOWN_COMMIT_TYPES.includes(segment);
  });
}

/** Extracts the merged branch name from a merge commit subject. */
export function mergeSubjectToBranchName(subject: string): string | undefined {
  return (
    PULL_REQUEST_MERGE_PATTERN.exec(subject)?.[1] ??
    LOCAL_MERGE_PATTERN.exec(subject)?.[1]
  );
}

/**
 * Classifies a commit subject: a Conventional Commit header wins, otherwise
 * the merged branch's prefix is used. Returns undefined when neither applies.
 */
export function subjectToClassification(
  subject: string,
): CommitClassification | undefined {
  const conventional = parseConventionalCommitTitle(subject);
  if (conventional !== undefined) {
    return conventional;
  }
  const branchName = mergeSubjectToBranchName(subject);
  const type =
    branchName === undefined ? undefined : branchNameToCommitType(branchName);
  return type === undefined ? undefined : { type, isBreaking: false };
}
