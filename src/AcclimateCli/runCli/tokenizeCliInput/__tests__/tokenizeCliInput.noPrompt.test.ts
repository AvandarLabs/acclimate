import { describe, expect, it } from "vitest";
import { createCli } from "@/AcclimateCli/createCli/createCli";
import { tokenizeCliInput } from "../tokenizeCliInput";

describe("tokenizeCliInput - --no-prompt", () => {
  it("recognizes built-in --no-prompt without failing as an unknown option or polluting rawOptionArgs", () => {
    const cli = createCli("demo").addOption({
      name: "--format",
      type: "string",
      required: false,
    });

    const result = tokenizeCliInput({
      cli,
      input: ["--no-prompt", "--format", "json"],
    });

    expect(result.isNoPromptRequested).toBe(true);
    expect(result.rawOptionArgs).toEqual({ "--format": "json" });
    expect(result.rawGlobalOptionArgs).toEqual({});
  });

  it("sets isNoPromptRequested from inline --no-prompt=false and --no-prompt=true values", () => {
    const cli = createCli("demo");

    expect(
      tokenizeCliInput({ cli, input: ["--no-prompt=false"] })
        .isNoPromptRequested,
    ).toBe(false);
    expect(
      tokenizeCliInput({ cli, input: ["--no-prompt=true"] })
        .isNoPromptRequested,
    ).toBe(true);
  });

  it("propagates built-in --no-prompt before a subcommand into the delegated subcommand result", () => {
    const coverageCli = createCli("coverage").addPositionalArg({
      name: "target",
      type: "string",
      required: true,
    });
    const rootCli = createCli("avandar-lint").addCommand(
      "coverage",
      coverageCli,
    );

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["--no-prompt", "coverage", "src/"],
    });

    expect(result.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(result.isNoPromptRequested).toBe(true);
    expect(result.rawPositionalArgs).toEqual(["src/"]);
  });

  it("preserves an explicitly registered --no-prompt option while also setting isNoPromptRequested", () => {
    const cli = createCli("coverage").addOption({
      name: "--no-prompt",
      type: "boolean",
      required: false,
      defaultValue: false,
    });

    const enabled = tokenizeCliInput({ cli, input: ["--no-prompt"] });
    expect(enabled.rawOptionArgs).toEqual({ "--no-prompt": "" });
    expect(enabled.isNoPromptRequested).toBe(true);

    const disabled = tokenizeCliInput({ cli, input: ["--no-prompt=false"] });
    expect(disabled.rawOptionArgs).toEqual({ "--no-prompt": "false" });
    expect(disabled.isNoPromptRequested).toBe(false);
  });

  it("passes --no-prompt after -- verbatim as a positional argument", () => {
    const cli = createCli("echo").addPositionalArg({
      name: "items",
      type: "string",
      required: true,
      variadic: true,
    });

    const result = tokenizeCliInput({
      cli,
      input: ["--", "--no-prompt"],
    });

    expect(result.isNoPromptRequested).toBe(false);
    expect(result.rawPositionalArgs).toEqual(["--no-prompt"]);
  });
});
