import { describe, expect, it, vi } from "vitest";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { createCLI } from "../createCLI";
import type { CLIParamDataType } from "@/AcclimateCLI/AcclimateCLI.types";

type ActionArgs = Record<string, CLIParamDataType>;

describe("runCLI - positional args", () => {
  it("parses required + optional positional args (defaultValue)", () => {
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

    runCLI({ cli, input: ["alpha"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", count: 3 });
  });

  it("parses optional positional arg when provided", () => {
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

    runCLI({ cli, input: ["alpha", "5"] });

    expect(action).toHaveBeenCalledWith({ first: "alpha", count: 5 });
  });

  it("throws when required positional arg is missing", () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("positional-required-missing")
      .addPositionalArg({
        name: "first",
        type: "string",
        required: true,
      })
      .action(action);

    expect(() => {
      runCLI({ cli, input: [] });
    }).toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("supports boolean positional args with a custom parser", () => {
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

    runCLI({ cli, input: ["false"] });

    expect(action).toHaveBeenCalledWith({ isEnabled: false });
  });
});

describe("runCLI - options", () => {
  it("parses required + optional options (mix -- and -)", () => {
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

    runCLI({
      cli,
      input: ["-n", "hello world", "--tags", "one", "two", "three"],
    });

    expect(action).toHaveBeenCalledWith({
      name: "hello world",
      tags: "one two three",
    });
  });

  it("uses defaultValue for an optional option when omitted", () => {
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

    runCLI({ cli, input: [] });

    expect(action).toHaveBeenCalledWith({ mode: "safe" });
  });

  it("throws when a required option is missing", () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("options-required-missing")
      .addOption({
        name: "--name",
        aliases: ["-n"],
        type: "string",
        required: true,
      })
      .action(action);

    expect(() => {
      runCLI({ cli, input: [] });
    }).toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("does not apply defaultValue when the option is required", () => {
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

    expect(() => {
      runCLI({ cli, input: [] });
    }).toThrow();

    expect(action).not.toHaveBeenCalled();
  });

  it("supports boolean options as flags", () => {
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

    runCLI({ cli, input: ["--force"] });

    expect(action).toHaveBeenCalledWith({ force: true });
  });

  it("uses custom parser for an option", () => {
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

    runCLI({ cli, input: ["-p", "3000"] });

    expect(action).toHaveBeenCalledWith({ port: 3001 });
  });

  it("throws when validator fails", () => {
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

    expect(() => {
      runCLI({ cli, input: ["--age", "-1"] });
    }).toThrow();

    expect(action).not.toHaveBeenCalled();
  });
});

describe("runCLI - global options", () => {
  it("parses required + optional global options", () => {
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

    runCLI({ cli, input: ["-e", "prod", "--trace"] });

    expect(action).toHaveBeenCalledWith({
      env: "prod",
      trace: true,
    });
  });
});

describe("runCLI - commands", () => {
  it("runs a command action instead of the root action", () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const commandAction = vi.fn<(args: ActionArgs) => void>();

    const initCLI = createCLI("init").action(commandAction);

    const cli = createCLI("root")
      .addCommand("init", initCLI)
      .action(rootAction);

    runCLI({ cli, input: ["init"] });

    expect(commandAction).toHaveBeenCalled();
    expect(rootAction).not.toHaveBeenCalled();
  });

  it("throws on unknown command", () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("root").action(rootAction);

    expect(() => {
      runCLI({ cli, input: ["missingCommand"] });
    }).toThrow();

    expect(rootAction).not.toHaveBeenCalled();
  });

  it("parses command positional args (required + optional defaultValue)", () => {
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

    runCLI({ cli, input: ["deploy", "api"] });

    expect(deployAction).toHaveBeenCalledWith({
      service: "api",
      region: "us-east-1",
    });
  });

  it("parses command options (required + optional) with mixed values and aliases", () => {
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

    runCLI({
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

  it("parses global options for commands (required + optional)", () => {
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

    runCLI({
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
});
