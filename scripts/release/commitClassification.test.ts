import { describe, expect, it } from "vitest";
import {
  branchNameToCommitType,
  parseConventionalCommitTitle,
  subjectToClassification,
} from "./commitClassification";

describe("parseConventionalCommitTitle", () => {
  it.each([
    ["feat: add thing", { type: "feat", isBreaking: false }],
    ["fix(parser): bug", { type: "fix", isBreaking: false }],
    ["feat!: drop api", { type: "feat", isBreaking: true }],
    ["refactor(core)!: move", { type: "refactor", isBreaking: true }],
  ])("parses %s", (title, expected) => {
    expect(parseConventionalCommitTitle(title)).toEqual(expected);
  });

  it.each(["Add thing", "wip: stuff", "feat:", "feat add thing"])(
    "returns undefined for %s",
    (title) => {
      expect(parseConventionalCommitTitle(title)).toBeUndefined();
    },
  );
});

describe("branchNameToCommitType", () => {
  it.each([
    ["feat/thing", "feat"],
    ["jpsyx/feat/semantic-theme", "feat"],
    ["fix/bug", "fix"],
    ["main", undefined],
    ["release/1.2.3", undefined],
  ])("maps %s to %s", (branchName, expected) => {
    expect(branchNameToCommitType(branchName)).toBe(expected);
  });
});

describe("subjectToClassification", () => {
  it("prefers a conventional title", () => {
    expect(subjectToClassification("fix: a bug (#4)")).toEqual({
      type: "fix",
      isBreaking: false,
    });
  });

  it("reads the branch from a local merge subject", () => {
    expect(
      subjectToClassification("Merge jpsyx/feat/repeatable-positional-args"),
    ).toEqual({ type: "feat", isBreaking: false });
  });

  it("reads the branch from a GitHub pull request merge subject", () => {
    expect(
      subjectToClassification(
        "Merge pull request #7 from AvandarLabs/fix/release-pnpm-lockfile",
      ),
    ).toEqual({ type: "fix", isBreaking: false });
  });

  it("returns undefined when nothing classifies the subject", () => {
    expect(subjectToClassification("updated readme")).toBeUndefined();
    expect(subjectToClassification("Merge branch 'main'")).toBeUndefined();
  });
});
