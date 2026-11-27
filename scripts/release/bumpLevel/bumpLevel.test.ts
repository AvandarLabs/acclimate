import { describe, expect, it } from "vitest";
import { classificationToBumpLevel, maxBumpLevel } from "./bumpLevel";

describe("classificationToBumpLevel", () => {
  it.each([
    ["feat", "minor"],
    ["fix", "patch"],
    ["perf", "patch"],
    ["refactor", "none"],
    ["docs", "none"],
    ["chore", "none"],
    ["test", "none"],
    ["ci", "none"],
  ])("maps %s to %s", (type, expected) => {
    expect(
      classificationToBumpLevel({
        classification: { type, isBreaking: false },
        currentMajorVersion: 1,
      }),
    ).toBe(expected);
  });

  it("caps a breaking change to minor while major is 0", () => {
    expect(
      classificationToBumpLevel({
        classification: { type: "feat", isBreaking: true },
        currentMajorVersion: 0,
      }),
    ).toBe("minor");
  });

  it("bumps major for a breaking change at major 1 or higher", () => {
    expect(
      classificationToBumpLevel({
        classification: { type: "fix", isBreaking: true },
        currentMajorVersion: 1,
      }),
    ).toBe("major");
  });
});

describe("maxBumpLevel", () => {
  it("returns the highest level", () => {
    expect(maxBumpLevel(["patch", "minor", "none"])).toBe("minor");
  });

  it("returns none for an empty list", () => {
    expect(maxBumpLevel([])).toBe("none");
  });
});
