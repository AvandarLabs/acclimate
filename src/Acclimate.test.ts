import { describe, expect, it, vi } from "vitest";
import { Acclimate } from "@/Acclimate";

describe("Acclimate.log", () => {
  it("interpolates params using $varName$ tokens", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    Acclimate.log("Hello $name$", { name: "Pablo" });

    expect(logSpy).toHaveBeenCalledWith("Hello Pablo");
    logSpy.mockRestore();
  });

  it("applies color tokens and reset codes", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    Acclimate.log("|red|Error:|reset| There was an error.", {});

    expect(logSpy).toHaveBeenCalledWith(
      "\x1b[31mError:\x1b[0m There was an error.\x1b[0m",
    );
    logSpy.mockRestore();
  });

  it("appends a reset code when any color token is present", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    Acclimate.log("|green|Hello", {});

    expect(logSpy).toHaveBeenCalledWith("\x1b[32mHello\x1b[0m");
    logSpy.mockRestore();
  });

  it("leaves unknown color tokens unchanged", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    Acclimate.log("|nope|Hello", {});

    expect(logSpy).toHaveBeenCalledWith("|nope|Hello\x1b[0m");
    logSpy.mockRestore();
  });
});
