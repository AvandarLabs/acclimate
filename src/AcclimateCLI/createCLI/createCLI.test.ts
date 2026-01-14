import { describe, expect, it } from "vitest";
import { createCLI } from "./createCLI";

describe("AcclimateCLI.addPositionalArg", () => {
  it("throws if adding a required arg after an optional arg", () => {
    const cli = createCLI("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "maybe",
          type: "string",
          required: false,
        })
        .addPositionalArg({
          name: "must",
          type: "string",
          required: true,
        });
    }).toThrowError();
  });

  it("does not throw when adding only optional positional args", () => {
    const cli = createCLI("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "maybeOne",
          type: "string",
          required: false,
        })
        .addPositionalArg({
          name: "maybeTwo",
          type: "string",
          required: false,
        });
    }).not.toThrowError();
  });

  it("does not throw when adding only required positional args", () => {
    const cli = createCLI("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "mustOne",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "mustTwo",
          type: "string",
          required: true,
        });
    }).not.toThrowError();
  });

  it("does not throw when adding an optional arg after a required arg", () => {
    const cli = createCLI("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "must",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "maybe",
          type: "string",
          required: false,
        });
    }).not.toThrowError();
  });
});
