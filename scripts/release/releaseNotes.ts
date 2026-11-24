import { maxBumpLevel } from "./bumpLevel";
import { mergeSubjectToBranchName } from "./commitClassification";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  RELEASE_NOTES_MAX_TOKENS,
  RELEASE_NOTES_MODEL,
} from "./releaseConfig";
import type { BumpLevel } from "./bumpLevel";
import type { ReleaseCandidate } from "./releaseCommits";

/** A note as the model returns it, before bumps are resolved. */
export type RawReleaseNote = {
  text: string;
  commits: string[];
  bump: BumpLevel;
};

/** A finished release note: one changeset file's worth of content. */
export type ReleaseNote = {
  text: string;
  commitShas: string[];
  bump: BumpLevel;
};

const SYSTEM_PROMPT = `You write release notes for @avandar/acclimate, a TypeScript library for building type-safe command-line interfaces. Readers are developers who use the library.

You receive commits merged to main since the last release, each with a short SHA, subject, and a diff of the shipped source.

Rules:
- Write one note per user-visible change, in 1-2 plain sentences that start with a verb such as "Adds", "Fixes", or "Changes". Describe what a library user can now do or what behaves differently.
- Merge commits that belong to the same change into one note.
- Omit commits with no effect on library users: internal refactors, tests, CI, docs, formatting.
- Use only what the diffs show. Never invent features or behavior.
- For each note, list the short SHAs it covers and a bump: "minor" for new capabilities, "patch" for fixes and small tweaks. Never use "major".

Reply with only JSON: {"notes":[{"text":"...","commits":["abc1234"],"bump":"minor"}]}`;

function _buildCommitSection(candidate: ReleaseCandidate): string {
  const files = candidate.files.join(", ");
  return `### ${candidate.shortSha} ${candidate.subject}\nFiles: ${files}\n${candidate.diff}`;
}

/** Builds the user message listing every candidate commit. */
export function buildReleaseNotesUserPrompt(
  candidates: readonly ReleaseCandidate[],
): string {
  return candidates.map(_buildCommitSection).join("\n\n");
}

function _isBumpLevel(value: unknown): value is BumpLevel {
  return (
    value === "none" ||
    value === "patch" ||
    value === "minor" ||
    value === "major"
  );
}

function _toRawNote(value: unknown): RawReleaseNote {
  const note = value as Record<string, unknown> | undefined;
  const commits = note?.commits;
  if (
    typeof note?.text !== "string" ||
    !Array.isArray(commits) ||
    !commits.every((sha) => {
      return typeof sha === "string";
    }) ||
    !_isBumpLevel(note.bump)
  ) {
    throw new Error("Model reply has a malformed note.");
  }
  return { text: note.text, commits: commits, bump: note.bump };
}

/** Parses and validates the model reply (the JSON may be code-fenced). */
export function parseReleaseNotesResponse(reply: string): RawReleaseNote[] {
  const jsonText = reply.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(jsonText) as { notes?: unknown };
  if (!Array.isArray(parsed.notes)) {
    throw new Error("Model reply has no notes array.");
  }
  return parsed.notes.map(_toRawNote);
}

/** Asks the model to write release notes. Throws on any failure. */
export async function requestReleaseNotes(params: {
  apiKey: string;
  fetchFn: typeof fetch;
  candidates: readonly ReleaseCandidate[];
}): Promise<RawReleaseNote[]> {
  const { apiKey, fetchFn, candidates } = params;
  const response = await fetchFn(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: RELEASE_NOTES_MODEL,
      max_tokens: RELEASE_NOTES_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildReleaseNotesUserPrompt(candidates) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}.`);
  }
  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = body.content?.find((block) => {
    return block.type === "text";
  })?.text;
  if (text === undefined) {
    throw new Error("Anthropic API reply had no text block.");
  }
  return parseReleaseNotesResponse(text);
}

function _capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function _subjectToNoteText(subject: string): string {
  const branchName = mergeSubjectToBranchName(subject);
  const cleaned =
    branchName === undefined ?
      subject
        .replace(/^[a-z]+(?:\([^)]+\))?!?:\s+/, "")
        .replace(/\s*\(#\d+\)$/, "")
    : (branchName.split("/").at(-1) ?? branchName).replace(/[-_]/g, " ");
  return `${_capitalize(cleaned.trim().replace(/\.$/, ""))}.`;
}

/** Builds one plain note per commit, used when the model is unavailable. */
export function buildFallbackNotes(
  candidates: readonly ReleaseCandidate[],
): RawReleaseNote[] {
  return candidates.map((candidate) => {
    return {
      text: _subjectToNoteText(candidate.subject),
      commits: [candidate.shortSha],
      bump: candidate.knownBump ?? "patch",
    };
  });
}

/**
 * Settles each note's bump. When every cited commit has a deterministic bump
 * (from its subject or branch), that wins and the model cannot override it.
 * Otherwise the model's bump is used, capped at minor so only an explicit
 * breaking marker can ever cause a major release. Notes that cite no known
 * commit, or end at `none`, are dropped.
 */
export function resolveNoteBumps(params: {
  rawNotes: readonly RawReleaseNote[];
  candidates: readonly ReleaseCandidate[];
}): ReleaseNote[] {
  const { rawNotes, candidates } = params;
  return rawNotes.flatMap((note) => {
    const cited = candidates.filter((candidate) => {
      return note.commits.includes(candidate.shortSha);
    });
    if (cited.length === 0) {
      return [];
    }
    const knownBumps = cited.flatMap((candidate) => {
      return candidate.knownBump === undefined ? [] : [candidate.knownBump];
    });
    const modelBump = note.bump === "major" ? "minor" : note.bump;
    const bump =
      knownBumps.length === cited.length ?
        maxBumpLevel(knownBumps)
      : maxBumpLevel([...knownBumps, modelBump]);
    if (bump === "none") {
      return [];
    }
    return [
      {
        text: note.text,
        commitShas: cited.map((candidate) => {
          return candidate.shortSha;
        }),
        bump,
      },
    ];
  });
}
