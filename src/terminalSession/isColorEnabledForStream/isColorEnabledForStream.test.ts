import { describe, expect, it } from "vitest";
import { isColorEnabledForStream } from "./isColorEnabledForStream";

describe("isColorEnabledForStream", () => {
  it("returns true when the stream is a TTY and NO_COLOR and dumb TERM are unset", () => {
    const ttyStream = {
      write: () => {},
      isTTY: true,
    };

    expect(
      isColorEnabledForStream({
        stream: ttyStream,
        env: { TERM: "xterm-256color" },
      }),
    ).toBe(true);
    expect(
      isColorEnabledForStream({
        stream: ttyStream,
        env: { NO_COLOR: "" },
      }),
    ).toBe(true);
  });

  it("returns false when the stream is not a TTY", () => {
    expect(
      isColorEnabledForStream({
        stream: { write: () => {}, isTTY: false },
        env: { TERM: "xterm-256color" },
      }),
    ).toBe(false);
    expect(
      isColorEnabledForStream({
        stream: { write: () => {} },
        env: {},
      }),
    ).toBe(false);
  });

  it("returns false when NO_COLOR is nonempty", () => {
    expect(
      isColorEnabledForStream({
        stream: { write: () => {}, isTTY: true },
        env: { NO_COLOR: "1" },
      }),
    ).toBe(false);
  });

  it("returns false when TERM is dumb", () => {
    expect(
      isColorEnabledForStream({
        stream: { write: () => {}, isTTY: true },
        env: { TERM: "dumb" },
      }),
    ).toBe(false);
  });
});
