import { describe, expect, it } from "vitest";
import { buildChangesetMarkdown } from "./buildChangesetMarkdown";

describe("buildChangesetMarkdown", () => {
  it("renders frontmatter and the note text", () => {
    expect(
      buildChangesetMarkdown({
        packageName: "@avandar/acclimate",
        bump: "minor",
        text: "Adds a thing.",
      }),
    ).toBe('---\n"@avandar/acclimate": minor\n---\n\nAdds a thing.\n');
  });

  it("refuses a none bump", () => {
    expect(() => {
      return buildChangesetMarkdown({
        packageName: "x",
        bump: "none",
        text: "t",
      });
    }).toThrow();
  });
});
