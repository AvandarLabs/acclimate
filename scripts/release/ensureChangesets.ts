import { buildChangesetMarkdown } from "./buildChangesetMarkdown";
import { isVersionPublished } from "./npmRegistry";
import {
  collectReleaseCommits,
  findReleaseAnchor,
  selectReleaseCandidates,
} from "./releaseCommits";
import { DIFF_CHAR_BUDGET } from "./releaseConfig";
import {
  buildFallbackNotes,
  requestReleaseNotes,
  resolveNoteBumps,
} from "./releaseNotes";
import type { GitRunner, ReleaseCandidate } from "./releaseCommits";
import type { RawReleaseNote } from "./releaseNotes";

/** Everything `ensureChangesets` touches, injected so it can be tested. */
export type EnsureChangesetsDeps = {
  runGit: GitRunner;
  fetchFn: typeof fetch;
  /** Undefined means notes fall back to commit subjects. */
  apiKey: string | undefined;
  readPackageJson: () => Promise<{ name: string; version: string }>;
  listChangesetFiles: () => Promise<string[]>;
  writeChangesetFile: (fileName: string, content: string) => Promise<void>;
  log: (message: string) => void;
};

/** What a run decided to do. */
export type EnsureChangesetsResult =
  | { kind: "skipped-manual" }
  | { kind: "skipped-unpublished" }
  | { kind: "nothing-to-release" }
  | { kind: "written"; fileNames: string[] };

async function _requestNotesOrFallBack(
  deps: EnsureChangesetsDeps,
  candidates: readonly ReleaseCandidate[],
): Promise<RawReleaseNote[]> {
  if (deps.apiKey === undefined || deps.apiKey === "") {
    deps.log("No ANTHROPIC_API_KEY: using commit subjects as release notes.");
    return buildFallbackNotes(candidates);
  }
  try {
    return await requestReleaseNotes({
      apiKey: deps.apiKey,
      fetchFn: deps.fetchFn,
      candidates,
    });
  } catch (error) {
    deps.log(`Model call failed (${String(error)}): using commit subjects.`);
    return buildFallbackNotes(candidates);
  }
}

async function _writeChangesets(params: {
  deps: EnsureChangesetsDeps;
  packageName: string;
  candidates: readonly ReleaseCandidate[];
}): Promise<string[]> {
  const { deps, packageName, candidates } = params;
  const rawNotes = await _requestNotesOrFallBack(deps, candidates);
  const notes = resolveNoteBumps({ rawNotes, candidates });
  const fileNames: string[] = [];
  for (const [index, note] of notes.entries()) {
    const fileName = `auto-${index + 1}-${note.commitShas[0] ?? "note"}.md`;
    const content = buildChangesetMarkdown({
      packageName,
      bump: note.bump,
      text: note.text,
    });
    await deps.writeChangesetFile(fileName, content);
    fileNames.push(fileName);
  }
  return fileNames;
}

/**
 * Writes `.changeset/auto-*.md` files for everything merged since the last
 * release, so nobody has to run `changeset` by hand. The bump comes from
 * commit types and branch prefixes; a model writes the note text. The files
 * stay uncommitted: the Changesets action consumes them into the version PR,
 * and they are rebuilt on every run.
 *
 * Skips when a hand-written changeset exists (the maintainer's override) or
 * when the current version is not yet published (the version PR just merged
 * and the next step is to publish, not to version again).
 */
export async function ensureChangesets(
  deps: EnsureChangesetsDeps,
): Promise<EnsureChangesetsResult> {
  const changesetFiles = await deps.listChangesetFiles();
  const hasManualChangeset = changesetFiles.some((fileName) => {
    return fileName.endsWith(".md") && fileName !== "README.md";
  });
  if (hasManualChangeset) {
    deps.log("A changeset already exists: leaving it as is.");
    return { kind: "skipped-manual" };
  }
  const { name, version } = await deps.readPackageJson();
  if (!(await isVersionPublished({ name, version, fetchFn: deps.fetchFn }))) {
    deps.log(`${name}@${version} is not published yet: nothing to version.`);
    return { kind: "skipped-unpublished" };
  }
  const commits = await collectReleaseCommits({
    runGit: deps.runGit,
    anchor: await findReleaseAnchor(deps.runGit),
    diffCharBudget: DIFF_CHAR_BUDGET,
  });
  const candidates = selectReleaseCandidates({
    commits,
    currentMajorVersion: Number(version.split(".")[0]),
  });
  const fileNames =
    candidates.length === 0 ?
      []
    : await _writeChangesets({ deps, packageName: name, candidates });
  if (fileNames.length === 0) {
    deps.log("No releasable changes since the last release.");
    return { kind: "nothing-to-release" };
  }
  deps.log(`Wrote ${fileNames.length} changeset(s): ${fileNames.join(", ")}`);
  return { kind: "written", fileNames };
}
