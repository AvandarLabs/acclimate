import { describe, expect, it } from "vitest";
import {
  isReleaseBookkeepingSubject,
  isShippedFile,
  selectReleaseCandidates,
} from "./releaseCommits";
import type { ReleaseCommit } from "./releaseCommits";

function _commit(overrides: Partial<ReleaseCommit>): ReleaseCommit {
  return {
    sha: "1234567890",
    shortSha: "1234567",
    subject: "feat: thing",
    files: ["src/index.ts"],
    diff: "",
    ...overrides,
  };
}

describe("isShippedFile", () => {
  it.each([
    ["src/index.ts", true],
    ["src/theme/colors.ts", true],
    ["src/theme/colors.test.ts", false],
    ["src/__tests__/a.integration.test.ts", false],
    ["docs/releasing.md", false],
    ["package.json", false],
  ])("%s -> %s", (path, expected) => {
    expect(isShippedFile(path)).toBe(expected);
  });
});

describe("isReleaseBookkeepingSubject", () => {
  it("matches the version PR commit and its merge", () => {
    expect(isReleaseBookkeepingSubject("Release: @avandar/acclimate")).toBe(
      true,
    );
    expect(
      isReleaseBookkeepingSubject(
        "Merge pull request #9 from AvandarLabs/changeset-release/main",
      ),
    ).toBe(true);
    expect(isReleaseBookkeepingSubject("feat: thing")).toBe(false);
  });
});

describe("selectReleaseCandidates", () => {
  it("keeps releasable and unclassified commits that touch shipped files", () => {
    const candidates = selectReleaseCandidates({
      commits: [
        _commit({ subject: "feat: a", shortSha: "aaaaaaa" }),
        _commit({ subject: "fix: b", shortSha: "bbbbbbb" }),
        _commit({ subject: "Added stuff", shortSha: "ccccccc" }),
      ],
      currentMajorVersion: 0,
    });
    expect(
      candidates.map((c) => {
        return [c.shortSha, c.knownBump];
      }),
    ).toEqual([
      ["aaaaaaa", "minor"],
      ["bbbbbbb", "patch"],
      ["ccccccc", undefined],
    ]);
  });

  it("drops non-releasing types, non-shipped changes, and bookkeeping", () => {
    const candidates = selectReleaseCandidates({
      commits: [
        _commit({ subject: "docs: readme" }),
        _commit({ subject: "refactor: tidy" }),
        _commit({ subject: "feat: ci only", files: [".github/ci.yaml"] }),
        _commit({ subject: "Release: @avandar/acclimate" }),
      ],
      currentMajorVersion: 0,
    });
    expect(candidates).toEqual([]);
  });
});
