import { describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { createMockTerminalSession } from "./runCLI.testHelpers";
import type { ActionArgs } from "./runCLI.testHelpers";

describe("runCLI - positional args", () => {
  it("applies defaultValue for an omitted optional positional arg alongside a required arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-defaults")
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

    await runCLI({ cli, input: ["alpha"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", retries: 3 });
  });

  it("overrides defaultValue when an optional positional arg is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-provided")
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

    await runCLI({ cli, input: ["alpha", "5"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", retries: 5 });
  });

  it("throws when a required positional arg is missing", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-required-missing")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .action(action);

    await expect(runCLI({ cli, input: [] })).rejects.toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("invokes a custom parser for a boolean positional arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-boolean-parser")
      .addPositionalArg({
        name: "isEnabled",
        type: "boolean",
        required: true,
        parser: (value) => {
          return value === "true";
        },
      })
      .action(action);

    await runCLI({ cli, input: ["false"] });

    expect(action).toHaveBeenCalledWith({ isEnabled: false });
  });

  it("prompts for an optional positional arg when askIfEmpty is true", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCLI("positional-ask-if-empty")
      .addPositionalArg({
        name: "tag",
        description: "Short tag value",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("alpha\n");

    await runCLI({ cli, input: [], terminal: terminal.session });

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

    const cli = createCLI("positional-ask-if-empty-message")
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

    await runCLI({ cli, input: [], terminal: terminal.session });

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

    const cli = createCLI("positional-ask-if-empty-optional")
      .addPositionalArg({
        name: "note",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("\n");

    await runCLI({ cli, input: [], terminal: terminal.session });

    expect(action).toHaveBeenCalledWith({ note: undefined });
  });

  it("re-prompts on the terminal session until a required askIfEmpty positional arg is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();
    const stdoutChunks: string[] = [];

    const cli = createCLI("positional-ask-if-empty-required")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    terminal.input.write("\nservice\n");

    await runCLI({
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
