import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { runCLI } from "@/AcclimateCLI/runCLI/runCLI";
import { expectRejectedCLIErrorCode } from "./runCLI.testHelpers";
import type { ActionArgs } from "./runCLI.testHelpers";

const readlineMocks = vi.hoisted(() => {
  const question = vi.fn<() => Promise<string>>();
  const close = vi.fn();
  const createInterface = vi.fn(() => {
    return { question, close };
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

describe("runCLI - error context", () => {
  it("rejects unknown flags on a subcommand with commandPath, hint, usage, and zero side effects", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const coverageCLI = createCLI("coverage")
      .description("Check coverage")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    const rootCLI = createCLI("avandar-lint")
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"] as const,
        type: "boolean",
        required: false,
      })
      .addCommand("coverage", coverageCLI);

    const error = await expectRejectedCLIErrorCode(
      runCLI({ cli: rootCLI, input: ["coverage", "--bogus"] }),
      "unknown_option",
    );

    expect(error.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(error.hint).toBe(
      "Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(error.usage).toContain("avandar-lint coverage <target> [options]");
    expect(error.usage).toContain("--verbose, -v");
    expect(action).not.toHaveBeenCalled();
    expect(readlineMocks.createInterface).not.toHaveBeenCalled();
  });

  it("attaches commandPath, hint, and usage when a required positional arg is missing", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const deployCLI = createCLI("deploy")
      .description("Deploy a service")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .action(action);
    const rootCLI = createCLI("acme").addCommand("deploy", deployCLI);

    const error = await expectRejectedCLIErrorCode(
      runCLI({ cli: rootCLI, input: ["deploy"] }),
      "missing_required_positional_arg",
    );

    expect(error.commandPath).toEqual(["acme", "deploy"]);
    expect(error.message).toContain("acme deploy");
    expect(error.hint).toBe(
      "Run acme deploy --help to see available options and usage.",
    );
    expect(error.usage).toContain("acme deploy <service> [options]");
    expect(action).not.toHaveBeenCalled();
  });

  it("attaches commandPath, hint, and usage when an option choice is invalid", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const cli = createCLI("lint")
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        choices: ["stylish", "json"] as const,
      })
      .action(action);

    const error = await expectRejectedCLIErrorCode(
      runCLI({ cli, input: ["--format", "xml"] }),
      "invalid_cli_param_value",
    );

    expect(error.commandPath).toEqual(["lint"]);
    expect(error.hint).toBe(
      "Run lint --help to see available options and usage.",
    );
    expect(error.usage).toContain("[choices: stylish | json]");
    expect(action).not.toHaveBeenCalled();
  });
});
