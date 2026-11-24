import { describe, expect, it } from "vitest";
import { createTheme } from "@/theme/createTheme/createTheme";
import { generateTerminalMessage } from "./generateTerminalMessage";

describe("generateTerminalMessage", () => {
  it("interpolates params using $varName$ tokens", () => {
    expect(generateTerminalMessage("Hello $name$", { name: "Pablo" })).toBe(
      "Hello Pablo",
    );
  });

  it("applies color tokens and reset codes", () => {
    expect(
      generateTerminalMessage("|red|Error:|reset| There was an error.", {}),
    ).toBe("\x1b[31mError:\x1b[0m There was an error.\x1b[0m");
  });

  it("appends a reset code when any color token is present", () => {
    expect(generateTerminalMessage("|green|Hello", {})).toBe(
      "\x1b[32mHello\x1b[0m",
    );
  });

  it("leaves unknown color tokens unchanged", () => {
    expect(generateTerminalMessage("|nope|Hello", {})).toBe(
      "|nope|Hello\x1b[0m",
    );
  });

  it("replaces tokens with empty strings when params are undefined", () => {
    expect(
      generateTerminalMessage("Target: $target$", { target: undefined }),
    ).toBe("Target: ");
  });

  it("interpolates number, boolean, and null param values", () => {
    expect(
      generateTerminalMessage(
        "Count: $count$ Active: $active$ Empty: $empty$",
        { count: 0, active: false, empty: null },
      ),
    ).toBe("Count: 0 Active: false Empty: null");
  });

  it("handles mixed primitive params including undefined", () => {
    expect(
      generateTerminalMessage(
        "Retries: $retries$ Enabled: $enabled$ Label: $label$ Note: $note$",
        { retries: 3, enabled: true, label: null, note: undefined },
      ),
    ).toBe("Retries: 3 Enabled: true Label: null Note: ");
  });

  it("applies the bold style token alongside bright colors", () => {
    expect(
      generateTerminalMessage("|bold||bright_green|❯ coverage|reset|", {}),
    ).toBe("\x1b[1m\x1b[92m❯ coverage\x1b[0m");
  });

  it("strips known style and color tokens without ANSI escapes when color is false", () => {
    expect(
      generateTerminalMessage(
        "|bold||bright_green|❯ $name$|reset| |nope|",
        { name: "coverage" },
        { color: false },
      ),
    ).toBe("❯ coverage |nope|");
  });

  it("applies semantic role tokens from the default dark palette and custom themes", () => {
    expect(
      generateTerminalMessage(
        "|heading|Usage|reset| |error|required|reset|",
        {},
      ),
    ).toBe("\x1b[93mUsage\x1b[0m \x1b[91mrequired\x1b[0m");

    const customTheme = createTheme({
      color: true,
      palette: { accent: "bright_magenta", prompt: "bright_yellow" },
    });
    expect(
      generateTerminalMessage(
        "|accent|$cli$|reset| |prompt|Proceed?|reset|",
        { cli: "acme" },
        { theme: customTheme },
      ),
    ).toBe("\x1b[95macme\x1b[0m \x1b[93mProceed?\x1b[0m");
  });

  it("strips semantic role tokens and raw color tokens when stream is redirected, NO_COLOR is set, or TERM is dumb", () => {
    expect(
      generateTerminalMessage(
        "|selected|❯ $name$|reset| |muted|(default)|reset|",
        { name: "json" },
        { stream: { write: () => {}, isTTY: false }, env: {} },
      ),
    ).toBe("❯ json (default)");

    expect(
      generateTerminalMessage(
        "|error|❌ Failed|reset|",
        {},
        { isTTY: true, env: { NO_COLOR: "1" } },
      ),
    ).toBe("❌ Failed");

    expect(
      generateTerminalMessage(
        "|warning|⚠️ Retry|reset|",
        {},
        { isTTY: true, env: { TERM: "dumb" } },
      ),
    ).toBe("⚠️ Retry");
  });
});
