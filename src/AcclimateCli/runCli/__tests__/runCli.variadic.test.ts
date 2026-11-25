import { describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import {
  createMockTerminalSession,
  expectRejectedCliErrorCode,
} from "./runCli.testHelpers";
import type { ActionArgs } from "./runCli.testHelpers";

describe("runCli - variadic positional args and interleaved flags", () => {
  it("passes an empty array when an optional variadic arg has no defaultValue and receives zero inputs", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .action(action);

    await runCli({ cli, input: [] });

    expect(action).toHaveBeenCalledWith({ paths: [] });
  });

  it("returns a fresh copy of defaultValue when an optional variadic arg receives zero inputs", async () => {
    const receivedPaths: string[][] = [];
    const defaultPaths = ["src", "tests"];

    const cli = createCli("lint")
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

    await runCli({ cli, input: [] });
    await runCli({ cli, input: [] });

    expect(defaultPaths).toEqual(["src", "tests"]);
    expect(receivedPaths[0]).toEqual(["src", "tests", "mutated"]);
    expect(receivedPaths[1]).toEqual(["src", "tests", "mutated"]);
    expect(receivedPaths[0]).not.toBe(receivedPaths[1]);
  });

  it("throws missing_required_positional_arg when a required variadic arg receives zero inputs", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: true,
        variadic: true,
        defaultValue: ["ignored"],
      })
      .action(action);

    await expectRejectedCliErrorCode(
      runCli({ cli, input: [] }),
      "missing_required_positional_arg",
    );

    expect(action).not.toHaveBeenCalled();
  });

  it("allocates leading fixed positional args and collects all remaining tokens into the trailing variadic arg", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("copy")
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

    await runCli({ cli, input: ["dist", "a.ts", "b.ts", "c.ts"] });

    expect(action).toHaveBeenCalledWith({
      destination: "dist",
      sources: ["a.ts", "b.ts", "c.ts"],
    });
  });

  it("converts numeric and boolean variadic positional args including negative numbers", async () => {
    const numAction = vi.fn<(args: ActionArgs) => void>();
    const numCli = createCli("sum")
      .addPositionalArg({
        name: "values",
        type: "number",
        required: true,
        variadic: true,
      })
      .action(numAction);

    await runCli({ cli: numCli, input: ["10", "-5", "3"] });
    expect(numAction).toHaveBeenCalledWith({ values: [10, -5, 3] });

    const boolAction = vi.fn<(args: ActionArgs) => void>();
    const boolCli = createCli("flags")
      .addPositionalArg({
        name: "switches",
        type: "boolean",
        required: false,
        variadic: true,
      })
      .action(boolAction);

    await runCli({ cli: boolCli, input: ["true", "false", "true"] });
    expect(boolAction).toHaveBeenCalledWith({ switches: [true, false, true] });
  });

  it("accepts variadic positional args mixed before, between, and after subcommand and global flags", async () => {
    const coverageAction = vi.fn<(args: ActionArgs) => void>();

    const coverageCli = createCli("coverage")
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

    const rootCli = createCli("avandar-lint")
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"] as const,
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .addCommand("coverage", coverageCli);

    await runCli({
      cli: rootCli,
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

    const cli = createCli("lint")
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

    await runCli({
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

    const cli = createCli("lint")
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

    await runCli({ cli, input: [" a.ts ", "b.ts"] });
    expect(action).toHaveBeenCalledWith({ paths: ["a.ts", "b.ts"] });

    action.mockClear();
    const error = await expectRejectedCliErrorCode(
      runCli({ cli, input: ["a.ts", "b.js"] }),
      "invalid_cli_param_value",
    );
    expect(error.message).toContain("Only .ts files allowed");
    expect(action).not.toHaveBeenCalled();
  });

  it("throws invalid_cli_param_value when an option or variadic element is outside choices", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint")
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

    await expectRejectedCliErrorCode(
      runCli({ cli, input: ["web", "invalid-target"] }),
      "invalid_cli_param_value",
    );
    await expectRejectedCliErrorCode(
      runCli({ cli, input: ["--format", "xml"] }),
      "invalid_cli_param_value",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("prompts for an empty variadic positional arg when askIfEmpty is enabled", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint")
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

    await runCli({ cli, input: [], terminal: firstTerminal.session });
    expect(action).toHaveBeenCalledWith({ paths: ["src/index.ts"] });

    action.mockClear();
    const secondTerminal = createMockTerminalSession();
    secondTerminal.input.write("\n");
    await runCli({ cli, input: [], terminal: secondTerminal.session });
    expect(action).toHaveBeenCalledWith({ paths: [] });
  });

  it("falls back to defaultValue when askIfEmpty variadic arg is submitted blank", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const terminal = createMockTerminalSession();

    const cli = createCli("lint")
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

    await runCli({ cli, input: [], terminal: terminal.session });
    expect(action).toHaveBeenCalledWith({ paths: ["src"] });
  });

  it("throws unknown_option for an unrecognized flag before --", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint").action(action);

    await expectRejectedCliErrorCode(
      runCli({ cli, input: ["--does-not-exist"] }),
      "unknown_option",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("throws missing_option_value when a value-taking option has no value", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("lint")
      .addOption({
        name: "--format",
        type: "string",
        required: false,
      })
      .action(action);

    await expectRejectedCliErrorCode(
      runCli({ cli, input: ["--format"] }),
      "missing_option_value",
    );
    expect(action).not.toHaveBeenCalled();
  });
});
