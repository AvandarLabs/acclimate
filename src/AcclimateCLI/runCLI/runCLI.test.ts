import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { createCLI } from "../createCLI";
import type { CLIParamDataType } from "@/AcclimateCLI/AcclimateCLI.types";

type ActionArgs = Record<string, CLIParamDataType>;

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
  it("parses required + optional positional args (defaultValue)", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-defaults")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "count",
        type: "number",
        required: false,
        defaultValue: 3,
      })
      .action(action);

    await runCLI({ cli, input: ["alpha"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", count: 3 });
  });

  it("parses optional positional arg when provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-provided")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "count",
        type: "number",
        required: false,
        defaultValue: 3,
      })
      .action(action);

    await runCLI({ cli, input: ["alpha", "5"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", count: 5 });
  });

  it("throws when required positional arg is missing", async () => {
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

  it("supports boolean positional args with a custom parser", async () => {
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
        "|bright_cyan|Please enter a value for tag (Short tag value)|reset| |gray|(press Enter to leave empty)|reset|: ",
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
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
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

describe("runCLI - options", () => {
  it("parses required + optional options (mix -- and -)", async () => {
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
      input: ["-n", "hello world", "--tags", "one", "two", "three"],
    });

    expect(action).toHaveBeenCalledWith({
      name: "hello world",
      tags: "one two three",
    });
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

  it("supports boolean options as flags", async () => {
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

  it("throws when validator fails", async () => {
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
        "|bright_cyan|Please enter a value for --note|reset| |gray|(press Enter to leave empty)|reset|: ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ note: "hello" });
  });

  it("re-prompts for required option until a value is provided", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
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
});

describe("runCLI - global options", () => {
  it("parses required + optional global options", async () => {
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
        "|bright_cyan|Please enter a value for --token|reset| |gray|(press Enter to leave empty)|reset|: ",
      ),
    );
    expect(action).toHaveBeenCalledWith({ token: "abc123" });
  });
});

describe("runCLI - commands", () => {
  it("runs a command with no arguments", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const devCommandAction = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("root")
      .addCommand("dev", createCLI("dev").action(devCommandAction))
      .action(rootAction);

    await runCLI({ cli, input: ["dev"] });

    expect(devCommandAction).toHaveBeenCalled();
  });

  it("runs a command action instead of the root action", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const commandAction = vi.fn<(args: ActionArgs) => void>();

    const initCLI = createCLI("init").action(commandAction);

    const cli = createCLI("root")
      .addCommand("init", initCLI)
      .action(rootAction);

    await runCLI({ cli, input: ["init"] });

    expect(commandAction).toHaveBeenCalled();
    expect(rootAction).not.toHaveBeenCalled();
  });

  it("throws on unknown command", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("root").action(rootAction);

    await expect(runCLI({ cli, input: ["missingCommand"] })).rejects.toThrow();

    expect(rootAction).not.toHaveBeenCalled();
  });

  it("parses command positional args (required + optional defaultValue)", async () => {
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCLI = createCLI("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "region",
        type: "string",
        required: false,
        defaultValue: "us-east-1",
      })
      .action(deployAction);

    const cli = createCLI("root").addCommand("deploy", deployCLI);

    await runCLI({ cli, input: ["deploy", "api"] });

    expect(deployAction).toHaveBeenCalledWith({
      service: "api",
      region: "us-east-1",
    });
  });

  it("parses command options (required + optional) with mixed values and aliases", async () => {
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCLI = createCLI("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .addOption({
        name: "--replicas",
        aliases: ["-r"],
        type: "number",
        required: true,
      })
      .addOption({
        name: "--note",
        aliases: ["-n"],
        type: "string",
        required: false,
        defaultValue: "no note",
      })
      .addOption({
        name: "--dry-run",
        aliases: ["-d"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(deployAction);

    const cli = createCLI("root").addCommand("deploy", deployCLI);

    await runCLI({
      cli,
      input: [
        "deploy",
        "api",
        "-r",
        "3",
        "--note",
        "this is one token with spaces",
        "-d",
      ],
    });

    expect(deployAction).toHaveBeenCalledWith({
      service: "api",
      replicas: 3,
      note: "this is one token with spaces",
      dryRun: true,
    });
  });

  it("parses global options for commands (required + optional)", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCLI = createCLI("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .action(deployAction);

    const cli = createCLI("root")
      .addGlobalOption({
        name: "--token",
        aliases: ["-t"],
        type: "string",
        required: true,
      })
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .addCommand("deploy", deployCLI)
      .action(rootAction);

    await runCLI({
      cli,
      input: ["deploy", "api", "--verbose", "-t", "abc 123"],
    });

    expect(deployAction).toHaveBeenCalledWith({
      token: "abc 123",
      verbose: true,
      service: "api",
    });

    expect(rootAction).not.toHaveBeenCalled();
  });

  it("parses required positional and optional options in deeply nested sub-commands", async () => {
    const newModelAction = vi.fn<(args: ActionArgs) => void>();

    const newModelCLI = createCLI("new")
      .addPositionalArg({
        name: "modelName",
        description: "PascalCased model name (e.g. QueryColumn).",
        type: "string",
        required: true,
      })
      .addOption({
        name: "--path",
        aliases: ["-p"],
        description:
          "Output path where the `<ModelName>/` sub-directory will be placed",
        type: "string",
        required: false,
      })
      .action(newModelAction);
    const modelsCLI = createCLI("new").addCommand("new", newModelCLI);
    const devCLI = createCLI("dev").addCommand("models", modelsCLI);
    const rootCLI = createCLI("root").addCommand("dev", devCLI);

    await runCLI({
      cli: rootCLI,
      input: ["dev", "models", "new", "Dashboard"],
    });

    expect(newModelAction).toHaveBeenCalledWith({
      modelName: "Dashboard",
      path: undefined,
    });
  });
});
