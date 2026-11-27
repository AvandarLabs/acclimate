import { describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { createMockTerminalSession } from "./runCli.testHelpers";
import type { ActionArgs } from "./runCli.testHelpers";

describe("runCli - positional args", () => {
  it("applies defaultValue for an omitted optional positional arg alongside a required arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("positional-defaults")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "retries",
        type: "number",
        required: false,
        defaultValue: 3,
      })
      .action(action);

    await runCli({ cli, input: ["alpha"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", retries: 3 });
  });

  it("overrides defaultValue when an optional positional arg is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("positional-provided")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "retries",
        type: "number",
        required: false,
        defaultValue: 3,
      })
      .action(action);

    await runCli({ cli, input: ["alpha", "5"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", retries: 5 });
  });

  it("throws when a required positional arg is missing", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("positional-required-missing")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .action(action);

    await expect(runCli({ cli, input: [] })).rejects.toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("invokes a custom parser for a boolean positional arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("positional-boolean-parser")
      .addPositionalArg({
        name: "isEnabled",
        type: "boolean",
        required: true,
        parser: (value) => {
          return value === "true";
        },
      })
      .action(action);

    await runCli({ cli, input: ["false"] });

    expect(action).toHaveBeenCalledWith({ isEnabled: false });
  });

  it("prompts for an optional positional arg when askIfEmpty is true", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCli("positional-ask-if-empty")
      .addPositionalArg({
        name: "tag",
        description: "Short tag value",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("alpha\n");

    await runCli({ cli, input: [], terminal: terminal.session });

    expect(terminal.getOutput()).toContain(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for tag (Short tag value)|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ tag: "alpha" });
  });

  it("uses the custom askIfEmpty message when provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCli("positional-ask-if-empty-message")
      .addPositionalArg({
        name: "tag",
        type: "string",
        required: false,
        askIfEmpty: {
          message: "Tag to use?",
        },
      })
      .action(action);

    terminal.input.write("beta\n");

    await runCli({ cli, input: [], terminal: terminal.session });

    expect(terminal.getOutput()).toContain(
      generateTerminalMessage(
        "|bright_cyan|Tag to use?|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ tag: "beta" });
  });

  it("returns undefined when optional askIfEmpty is left blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCli("positional-ask-if-empty-optional")
      .addPositionalArg({
        name: "note",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("\n");

    await runCli({ cli, input: [], terminal: terminal.session });

    expect(action).toHaveBeenCalledWith({ note: undefined });
  });

  it("re-prompts on the terminal session until a required askIfEmpty positional arg is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();
    const stdoutChunks: string[] = [];

    const cli = createCli("positional-ask-if-empty-required")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("\nservice\n");

    await runCli({
      cli,
      input: [],
      stdout: {
        write: (chunk: string) => {
          stdoutChunks.push(chunk);
        },
      },
      terminal: terminal.session,
    });

    expect(terminal.getOutput()).toContain(
      "\x1b[91mThis value is required.\x1b[0m Please enter a value.\n",
    );
    expect(stdoutChunks.join("")).toBe("");
    expect(action).toHaveBeenCalledWith({ target: "service" });
  });
});
