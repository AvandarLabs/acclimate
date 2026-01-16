import { describe, expect, it } from "vitest";
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
    expect(generateTerminalMessage("Target: $target$", { target: undefined })).toBe(
      "Target: ",
    );
  });
});
