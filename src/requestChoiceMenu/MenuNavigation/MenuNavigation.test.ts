import { describe, expect, it } from "vitest";
import { MenuNavigation } from "./MenuNavigation";

describe("MenuNavigation", () => {
  it("maps arrow keys, Vim j/k/g/G, Home/End, digits, Enter, and Ctrl-C/Ctrl-D to menu events", () => {
    expect(MenuNavigation.parseKeyChunk("\x1b[A").events).toEqual([
      { kind: "up" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x1bOA").events).toEqual([
      { kind: "up" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x1b[B").events).toEqual([
      { kind: "down" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x1bOB").events).toEqual([
      { kind: "down" },
    ]);
    expect(MenuNavigation.parseKeyChunk("jk").events).toEqual([
      { kind: "down" },
      { kind: "up" },
    ]);
    expect(MenuNavigation.parseKeyChunk("gG").events).toEqual([
      { kind: "first" },
      { kind: "last" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x1b[H\x1b[F").events).toEqual([
      { kind: "first" },
      { kind: "last" },
    ]);
    expect(MenuNavigation.parseKeyChunk("2\r").events).toEqual([
      { kind: "digit", index: 1 },
      { kind: "confirm" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x03").events).toEqual([
      { kind: "cancel", reason: "ctrl_c" },
    ]);
    expect(MenuNavigation.parseKeyChunk("\x04").events).toEqual([
      { kind: "cancel", reason: "eof" },
    ]);
    expect(MenuNavigation.parseKeyChunk("xz").events).toEqual([]);
  });

  it("buffers split escape sequences across chunks and parses them once complete", () => {
    const firstChunk = MenuNavigation.parseKeyChunk("\x1b");
    expect(firstChunk.events).toEqual([]);
    expect(firstChunk.pendingEscapeBuffer).toBe("\x1b");

    const secondChunk = MenuNavigation.parseKeyChunk(
      "[B",
      firstChunk.pendingEscapeBuffer,
    );
    expect(secondChunk.events).toEqual([{ kind: "down" }]);
    expect(secondChunk.pendingEscapeBuffer).toBe("");
  });

  it("wraps up and down navigation across first and last choice boundaries", () => {
    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 0,
        numChoices: 3,
        event: { kind: "up" },
      }),
    ).toBe(2);

    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 2,
        numChoices: 3,
        event: { kind: "down" },
      }),
    ).toBe(0);
  });

  it("jumps to first and last items on g/G and clamps out-of-range digit keys", () => {
    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 2,
        numChoices: 4,
        event: { kind: "first" },
      }),
    ).toBe(0);

    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 0,
        numChoices: 4,
        event: { kind: "last" },
      }),
    ).toBe(3);

    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 1,
        numChoices: 3,
        event: { kind: "digit", index: 2 },
      }),
    ).toBe(2);

    expect(
      MenuNavigation.stepIndex({
        selectedIndex: 1,
        numChoices: 3,
        event: { kind: "digit", index: 7 },
      }),
    ).toBe(1);
  });
});
