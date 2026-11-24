import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import type { ActionArgs } from "./runCLI.testHelpers";

const readlineMocks = vi.hoisted(() => {
  const question = vi.fn<() => Promise<string>>();
  const close = vi.fn();
  const createInterface = vi.fn(() => {
    return {
      question,
      close,
    };
  });

  return { question, close, createInterface };
});

vi.mock("node:readline/promises", () => {
  return {
    createInterface: readlineMocks.createInterface,
  };
});

beforeEach(() => {
  readlineMocks.question.mockReset();
  readlineMocks.close.mockReset();
  readlineMocks.createInterface.mockReset();
  readlineMocks.createInterface.mockReturnValue({
    question: readlineMocks.question,
    close: readlineMocks.close,
  });
});

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

    const cli = createCLI("positional-ask-if-empty")
      .addPositionalArg({
        name: "tag",
        description: "Short tag value",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("alpha");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for tag (Short tag value)|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ tag: "alpha" });
    expect(readlineMocks.close).toHaveBeenCalledTimes(1);
  });

  it("uses the custom askIfEmpty message when provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

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

    readlineMocks.question.mockResolvedValueOnce("beta");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Tag to use?|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ tag: "beta" });
  });

  it("returns undefined when optional askIfEmpty is left blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-ask-if-empty-optional")
      .addPositionalArg({
        name: "note",
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("");

    await runCLI({ cli, input: [] });

    expect(action).toHaveBeenCalledWith({ note: undefined });
  });

  it("re-prompts until a required askIfEmpty positional arg is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });

    const cli = createCLI("positional-ask-if-empty-required")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("service");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|red|This value is required.|reset| Please enter a value.\n",
      ),
    );
    expect(action).toHaveBeenCalledWith({ target: "service" });

    stdoutSpy.mockRestore();
  });
});
