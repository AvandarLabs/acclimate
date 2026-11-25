import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import { expectRejectedCliErrorCode } from "./runCli.testHelpers";
import type { ActionArgs } from "./runCli.testHelpers";

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

describe("runCli - error context", () => {
  it("rejects unknown flags on a subcommand with commandPath, hint, usage, and zero side effects", async () => {
    const action = vi.fn<(args: ActionArgs) => void>();
    const coverageCli = createCli("coverage")
      .description("Check coverage")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        askIfEmpty: true,
      })
      .action(action);

    const rootCli = createCli("avandar-lint")
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"] as const,
        type: "boolean",
        required: false,
      })
      .addCommand("coverage", coverageCli);

    const error = await expectRejectedCliErrorCode(
      runCli({ cli: rootCli, input: ["coverage", "--bogus"] }),
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
    const deployCli = createCli("deploy")
      .description("Deploy a service")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .action(action);
    const rootCli = createCli("acme").addCommand("deploy", deployCli);

    const error = await expectRejectedCliErrorCode(
      runCli({ cli: rootCli, input: ["deploy"] }),
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
    const cli = createCli("lint")
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        choices: ["stylish", "json"] as const,
      })
      .action(action);

    const error = await expectRejectedCliErrorCode(
      runCli({ cli, input: ["--format", "xml"] }),
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
