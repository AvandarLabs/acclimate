import { describe, expect, it } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { tokenizeCLIInput } from "../tokenizeCLIInput";

describe("tokenizeCLIInput - --no-prompt", () => {
  it("recognizes built-in --no-prompt without failing as an unknown option or polluting rawOptionArgs", () => {
    const cli = createCLI("demo").addOption({
      name: "--format",
      type: "string",
      required: false,
    });

    const result = tokenizeCLIInput({
      cli,
      input: ["--no-prompt", "--format", "json"],
    });

    expect(result.isNoPromptRequested).toBe(true);
    expect(result.rawOptionArgs).toEqual({ "--format": "json" });
    expect(result.rawGlobalOptionArgs).toEqual({});
  });

  it("sets isNoPromptRequested from inline --no-prompt=false and --no-prompt=true values", () => {
    const cli = createCLI("demo");

    expect(
      tokenizeCLIInput({ cli, input: ["--no-prompt=false"] })
        .isNoPromptRequested,
    ).toBe(false);
    expect(
      tokenizeCLIInput({ cli, input: ["--no-prompt=true"] })
        .isNoPromptRequested,
    ).toBe(true);
  });

  it("propagates built-in --no-prompt before a subcommand into the delegated subcommand result", () => {
    const coverageCLI = createCLI("coverage").addPositionalArg({
      name: "target",
      type: "string",
      required: true,
    });
    const rootCLI = createCLI("avandar-lint").addCommand(
      "coverage",
      coverageCLI,
    );

    const result = tokenizeCLIInput({
      cli: rootCLI,
      input: ["--no-prompt", "coverage", "src/"],
    });

    expect(result.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(result.isNoPromptRequested).toBe(true);
    expect(result.rawPositionalArgs).toEqual(["src/"]);
  });

  it("preserves an explicitly registered --no-prompt option while also setting isNoPromptRequested", () => {
    const cli = createCLI("coverage").addOption({
      name: "--no-prompt",
      type: "boolean",
      required: false,
      defaultValue: false,
    });

    const enabled = tokenizeCLIInput({ cli, input: ["--no-prompt"] });
    expect(enabled.rawOptionArgs).toEqual({ "--no-prompt": "" });
    expect(enabled.isNoPromptRequested).toBe(true);

    const disabled = tokenizeCLIInput({ cli, input: ["--no-prompt=false"] });
    expect(disabled.rawOptionArgs).toEqual({ "--no-prompt": "false" });
    expect(disabled.isNoPromptRequested).toBe(false);
  });

  it("passes --no-prompt after -- verbatim as a positional argument", () => {
    const cli = createCLI("echo").addPositionalArg({
      name: "items",
      type: "string",
      required: true,
      variadic: true,
    });

    const result = tokenizeCLIInput({
      cli,
      input: ["--", "--no-prompt"],
    });

    expect(result.isNoPromptRequested).toBe(false);
    expect(result.rawPositionalArgs).toEqual(["--no-prompt"]);
  });
});
