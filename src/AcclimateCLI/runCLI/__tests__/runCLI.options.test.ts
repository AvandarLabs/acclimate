import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { expectRejectedCLIErrorCode } from "./runCLI.testHelpers";
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

describe("runCLI - options", () => {
  it("resolves required and optional options passed via long names and short aliases", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-required-optional")
      .addOption({
        name: "--name",
        aliases: ["-n"],
        type: "string",
        required: true,
      })
      .addOption({
        name: "--tags",
        aliases: ["-t"],
        type: "string",
        required: false,
        defaultValue: "default tag",
      })
      .action(action);

    await runCLI({
      cli,
      input: ["-n", "hello world", "--tags", "one two three"],
    });

    expect(action).toHaveBeenCalledWith({
      name: "hello world",
      tags: "one two three",
    });
  });

  it("throws too_many_positional_args when extra non-flag tokens follow a value option on a CLI with no positional args", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-no-positionals")
      .addOption({
        name: "--tags",
        type: "string",
        required: false,
      })
      .action(action);

    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["--tags", "one", "two"] }),
      "too_many_positional_args",
    );

    expect(action).not.toHaveBeenCalled();
  });

  it("uses defaultValue for an optional option when omitted", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-default")
      .addOption({
        name: "--mode",
        aliases: ["-m"],
        type: "string",
        required: false,
        defaultValue: "safe",
      })
      .action(action);

    await runCLI({ cli, input: [] });

    expect(action).toHaveBeenCalledWith({ mode: "safe" });
  });

  it("throws when a required option is missing", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-required-missing")
      .addOption({
        name: "--name",
        aliases: ["-n"],
        type: "string",
        required: true,
      })
      .action(action);

    await expect(runCLI({ cli, input: [] })).rejects.toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("does not apply defaultValue when the option is required", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-required-default-ignored")
      .addOption({
        name: "--name",
        aliases: ["-n"],
        type: "string",
        required: true,
        defaultValue: "ignored default",
      })
      .action(action);

    await expect(runCLI({ cli, input: [] })).rejects.toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("sets a boolean option to true when passed as a bare flag", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-boolean-flag")
      .addOption({
        name: "--force",
        aliases: ["-f"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(action);

    await runCLI({ cli, input: ["--force"] });

    expect(action).toHaveBeenCalledWith({ force: true });
  });

  it("uses custom parser for an option", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-custom-parser")
      .addOption({
        name: "--port",
        aliases: ["-p"],
        type: "number",
        required: true,
        parser: (value) => {
          return Number.parseInt(value, 10) + 1;
        },
      })
      .action(action);

    await runCLI({ cli, input: ["-p", "3000"] });

    expect(action).toHaveBeenCalledWith({ port: 3001 });
  });

  it("throws when validator fails on a negative numeric option value", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-validator-fails")
      .addOption({
        name: "--age",
        aliases: ["-a"],
        type: "number",
        required: true,
        validator: (value) => {
          return value > 0;
        },
      })
      .action(action);

    await expect(runCLI({ cli, input: ["--age", "-1"] })).rejects.toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("prompts for an option when askIfEmpty is true", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-ask-if-empty")
      .addOption({
        name: "--note",
        aliases: ["-n"],
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("hello");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for --note|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ note: "hello" });
  });

  it("uses defaultValue when optional askIfEmpty option is left blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-ask-if-empty-default")
      .addOption({
        name: "--mode",
        aliases: ["-m"],
        type: "string",
        required: false,
        askIfEmpty: true,
        defaultValue: "safe",
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for --mode|reset| [default: safe] |gray|(press Enter to use default)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ mode: "safe" });
  });

  it("re-prompts for required option until a value is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });

    const cli = createCLI("options-ask-if-empty-required")
      .addOption({
        name: "--mode",
        aliases: ["-m"],
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("safe");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|red|This value is required.|reset| Please enter a value.\n",
      ),
    );
    expect(action).toHaveBeenCalledWith({ mode: "safe" });

    stdoutSpy.mockRestore();
  });

  it("uses defaultValue when required askIfEmpty option is left blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-ask-if-empty-required-default")
      .addOption({
        name: "--mode",
        aliases: ["-m"],
        type: "string",
        required: true,
        askIfEmpty: true,
        defaultValue: "safe",
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for --mode|reset| [default: safe] |gray|(press Enter to use default)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ mode: "safe" });
  });
});

describe("runCLI - global options", () => {
  it("passes required and optional global option values to the root action", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("global-options")
      .addGlobalOption({
        name: "--env",
        aliases: ["-e"],
        type: "string",
        required: true,
      })
      .addGlobalOption({
        name: "--trace",
        aliases: ["-t"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(action);

    await runCLI({ cli, input: ["-e", "prod", "--trace"] });

    expect(action).toHaveBeenCalledWith({
      env: "prod",
      trace: true,
    });
  });

  it("prompts for a global option when askIfEmpty is true", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("global-options-ask-if-empty")
      .addGlobalOption({
        name: "--token",
        aliases: ["-t"],
        type: "string",
        required: false,
        askIfEmpty: true,
      })
      .action(action);

    readlineMocks.question.mockResolvedValueOnce("abc123");

    await runCLI({ cli, input: [] });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Please enter a value for --token|reset| |gray|(press Enter to leave empty)|reset| ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ token: "abc123" });
  });
});
