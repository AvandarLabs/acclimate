import { describe, expect, it } from "vitest";
import { renderChoiceMenu } from "./renderChoiceMenu";

describe("renderChoiceMenu", () => {
  it("highlights the selected choice in bold bright green with a textual cursor", () => {
    const rendered = renderChoiceMenu({
      message: "Choose output format",
      choices: [
        { value: "stylish", label: "stylish", description: "Human summary" },
        { value: "json", label: "json", description: "Machine output" },
      ],
      selectedIndex: 1,
      defaultValue: "stylish",
      isColorEnabled: true,
    });

    expect(rendered.lineCount).toBe(3);
    expect(rendered.text).toContain("Choose output format");
    expect(rendered.text).toContain("\x1b[1m\x1b[92m❯ json\x1b[0m");
    expect(rendered.text).toContain("  stylish");
    expect(rendered.text).toContain("(default)");
    expect(rendered.text).toContain("Machine output");
  });

  it("omits ANSI escapes while keeping textual cursor, labels, and defaults when color is false", () => {
    const rendered = renderChoiceMenu({
      message: "Select command",
      choices: [
        { value: "check", description: "Run linter" },
        { value: "coverage", description: "Check coverage" },
      ],
      selectedIndex: 0,
      defaultValue: "coverage",
      isColorEnabled: false,
    });

    expect(rendered.text).not.toContain("\x1b[");
    expect(rendered.text).toContain("❯ check - Run linter");
    expect(rendered.text).toContain("  coverage (default) - Check coverage");
  });
});
