import { describe, expect, it } from "vitest";
import { extractChangelogSection } from "./extractChangelogSection";

const CHANGELOG = `# @avandar/acclimate

## 0.5.0

### Minor Changes

- Adds a thing.

- Adds another thing.

## 0.4.0

### Patch Changes

- Old note.
`;

describe("extractChangelogSection", () => {
  it("returns the body under the version heading", () => {
    expect(
      extractChangelogSection({ changelog: CHANGELOG, version: "0.5.0" }),
    ).toBe("### Minor Changes\n\n- Adds a thing.\n\n- Adds another thing.");
  });

  it("returns the last section when no heading follows it", () => {
    expect(
      extractChangelogSection({ changelog: CHANGELOG, version: "0.4.0" }),
    ).toBe("### Patch Changes\n\n- Old note.");
  });

  it("does not match a longer version that shares a prefix", () => {
    expect(
      extractChangelogSection({ changelog: CHANGELOG, version: "0.5" }),
    ).toBeUndefined();
  });

  it("returns undefined for a missing version", () => {
    expect(
      extractChangelogSection({ changelog: CHANGELOG, version: "9.9.9" }),
    ).toBeUndefined();
  });
});
