import { describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import {
  createMockTerminalSession,
  expectRejectedCLIErrorCode,
} from "./runCLI.testHelpers";
import type { ActionArgs } from "./runCLI.testHelpers";

describe("runCLI - variadic positional args and interleaved flags", () => {
  it("passes an empty array when an optional variadic arg has no defaultValue and receives zero inputs", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .action(action);

    await runCLI({ cli, input: [] });

    expect(action).toHaveBeenCalledWith({ paths: [] });
  });

  it("returns a fresh copy of defaultValue when an optional variadic arg receives zero inputs", async () => {
    const receivedPaths: string[][] = [];
    const defaultPaths = ["src", "tests"];

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
        defaultValue: defaultPaths,
      })
      .action(({ paths }) => {
        receivedPaths.push(paths);
        paths.push("mutated");
      });

    await runCLI({ cli, input: [] });
    await runCLI({ cli, input: [] });

    expect(defaultPaths).toEqual(["src", "tests"]);
    expect(receivedPaths[0]).toEqual(["src", "tests", "mutated"]);
    expect(receivedPaths[1]).toEqual(["src", "tests", "mutated"]);
    expect(receivedPaths[0]).not.toBe(receivedPaths[1]);
  });

  it("throws missing_required_positional_arg when a required variadic arg receives zero inputs", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: true,
        variadic: true,
        defaultValue: ["ignored"],
      })
      .action(action);

    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: [] }),
      "missing_required_positional_arg",
    );

    expect(action).not.toHaveBeenCalled();
  });

  it("allocates leading fixed positional args and collects all remaining tokens into the trailing variadic arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("copy")
      .addPositionalArg({
        name: "destination",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "sources",
        type: "string",
        required: true,
        variadic: true,
      })
      .action(action);

    await runCLI({ cli, input: ["dist", "a.ts", "b.ts", "c.ts"] });

    expect(action).toHaveBeenCalledWith({
      destination: "dist",
      sources: ["a.ts", "b.ts", "c.ts"],
    });
  });

  it("converts numeric and boolean variadic positional args including negative numbers", async () => {
    const numAction = vi.fn<(args: ActionArgs) => void>();
    const numCLI = createCLI("sum")
      .addPositionalArg({
        name: "values",
        type: "number",
        required: true,
        variadic: true,
      })
      .action(numAction);

    await runCLI({ cli: numCLI, input: ["10", "-5", "3"] });
    expect(numAction).toHaveBeenCalledWith({ values: [10, -5, 3] });

    const boolAction = vi.fn<(args: ActionArgs) => void>();
    const boolCLI = createCLI("flags")
      .addPositionalArg({
        name: "switches",
        type: "boolean",
        required: false,
        variadic: true,
      })
      .action(boolAction);

    await runCLI({ cli: boolCLI, input: ["true", "false", "true"] });
    expect(boolAction).toHaveBeenCalledWith({ switches: [true, false, true] });
  });

  it("accepts variadic positional args mixed before, between, and after subcommand and global flags", async () => {
    const coverageAction = vi.fn<(args: ActionArgs) => void>();

    const coverageCLI = createCLI("coverage")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .addOption({
        name: "--format",
        aliases: ["-f"] as const,
        type: "string",
        required: false,
        choices: ["stylish", "agent", "json"] as const,
        defaultValue: "stylish",
      })
      .addOption({
        name: "--no-prompt",
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(coverageAction);

    const rootCLI = createCLI("avandar-lint")
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"] as const,
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .addCommand("coverage", coverageCLI);

    await runCLI({
      cli: rootCLI,
      input: [
        "-v",
        "coverage",
        "src/a.ts",
        "--format",
        "json",
        "src/b.ts",
        "--no-prompt",
        "src/c.ts",
      ],
    });

    expect(coverageAction).toHaveBeenCalledWith({
      paths: ["src/a.ts", "src/b.ts", "src/c.ts"],
      format: "json",
      noPrompt: true,
      verbose: true,
    });
  });

  it("passes flag-like tokens after -- into a variadic positional arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        defaultValue: "stylish",
      })
      .action(action);

    await runCLI({
      cli,
      input: ["--format=agent", "--", "--not-a-flag", "-x", "--"],
    });

    expect(action).toHaveBeenCalledWith({
      paths: ["--not-a-flag", "-x", "--"],
      format: "agent",
    });
  });

  it("runs custom parser and validator on every element of a variadic positional arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: true,
        variadic: true,
        parser: (rawPath) => {
          return rawPath.trim();
        },
        validator: (trimmedPath) => {
          return trimmedPath.endsWith(".ts") ? true : "Only .ts files allowed";
        },
      })
      .action(action);

    await runCLI({ cli, input: [" a.ts ", "b.ts"] });
    expect(action).toHaveBeenCalledWith({ paths: ["a.ts", "b.ts"] });

    action.mockClear();
    const error = await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["a.ts", "b.js"] }),
      "invalid_cli_param_value",
    );
    expect(error.message).toContain("Only .ts files allowed");
    expect(action).not.toHaveBeenCalled();
  });

  it("throws invalid_cli_param_value when an option or variadic element is outside choices", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "targets",
        type: "string",
        required: false,
        variadic: true,
        choices: ["web", "api", "worker"] as const,
      })
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        choices: ["stylish", "agent", "json"] as const,
      })
      .action(action);

    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["web", "invalid-target"] }),
      "invalid_cli_param_value",
    );
    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["--format", "xml"] }),
      "invalid_cli_param_value",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("prompts for an empty variadic positional arg when askIfEmpty is enabled", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
        askIfEmpty: { message: "Which path should I inspect?" },
      })
      .action(action);

    const firstTerminal = createMockTerminalSession();
    firstTerminal.input.write("src/index.ts\n");

    await runCLI({ cli, input: [], terminal: firstTerminal.session });
    expect(action).toHaveBeenCalledWith({ paths: ["src/index.ts"] });

    action.mockClear();
    const secondTerminal = createMockTerminalSession();
    secondTerminal.input.write("\n");
    await runCLI({ cli, input: [], terminal: secondTerminal.session });
    expect(action).toHaveBeenCalledWith({ paths: [] });
  });

  it("falls back to defaultValue when askIfEmpty variadic arg is submitted blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCLI("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: true,
        variadic: true,
        askIfEmpty: true,
        defaultValue: ["src"],
      })
      .action(action);

    terminal.input.write("\n");

    await runCLI({ cli, input: [], terminal: terminal.session });
    expect(action).toHaveBeenCalledWith({ paths: ["src"] });
  });

  it("throws unknown_option for an unrecognized flag before --", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint").action(action);

    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["--does-not-exist"] }),
      "unknown_option",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("throws missing_option_value when a value-taking option has no value", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCLI("lint")
      .addOption({
        name: "--format",
        type: "string",
        required: false,
      })
      .action(action);

    await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["--format"] }),
      "missing_option_value",
    );
    expect(action).not.toHaveBeenCalled();
  });
});
