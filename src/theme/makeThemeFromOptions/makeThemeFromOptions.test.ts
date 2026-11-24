import { describe, expect, it } from "vitest";
import { createTheme } from "../createTheme/createTheme";
import { makeThemeFromOptions } from "./makeThemeFromOptions";

describe("makeThemeFromOptions", () => {
  it("returns the provided SemanticTheme directly when no stream or color override is given", () => {
    const customTheme = createTheme({
      color: false,
      palette: { accent: "bright_magenta" },
    });

    const result = makeThemeFromOptions({ theme: customTheme });

    expect(result.isColorEnabled).toBe(false);
    expect(result.palette.accent).toBe("\x1b[95m");
  });

  it("rebinds a provided SemanticTheme palette to explicit color or stream/env detection", () => {
    const baseTheme = createTheme({
      color: true,
      palette: { accent: "bright_magenta" },
    });

    const plainFromNoColor = makeThemeFromOptions({
      theme: baseTheme,
      isTTY: true,
      env: { NO_COLOR: "1" },
    });
    expect(plainFromNoColor.isColorEnabled).toBe(false);
    expect(plainFromNoColor.accent("demo")).toBe("demo");

    const coloredOnTty = makeThemeFromOptions({
      theme: baseTheme.withColor(false),
      isTTY: true,
      env: {},
    });
    expect(coloredOnTty.isColorEnabled).toBe(true);
    expect(coloredOnTty.accent("demo")).toBe("\x1b[95mdemo\x1b[0m");
  });

  it("merges fallbackPalette and theme palette overrides and respects defaultColor when no target is supplied", () => {
    const coloredDefault = makeThemeFromOptions({
      defaultColor: true,
      fallbackPalette: { heading: "bright_magenta" },
      theme: { accent: "bright_green" },
    });

    expect(coloredDefault.isColorEnabled).toBe(true);
    expect(coloredDefault.heading("Usage")).toBe("\x1b[95mUsage\x1b[0m");
    expect(coloredDefault.accent("demo")).toBe("\x1b[92mdemo\x1b[0m");
  });
});
