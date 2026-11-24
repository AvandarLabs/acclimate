import { execFile } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCLI } from "@/AcclimateCLI/createCLI";
import { executeCLI } from "./executeCLI";

function _createMemoryStream() {
  const chunks: string[] = [];
  return {
    write: (chunk: string) => {
      chunks.push(chunk);
    },
    getOutput: () => {
      return chunks.join("");
    },
  };
}

function _makeCoverageCLI(onAction: () => void) {
  const coverageCLI = createCLI("coverage")
    .description("Check test coverage for target paths")
    .addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
      description: "Paths to inspect",
    })
    .addOption({
      name: "--format",
      aliases: ["-f"] as const,
      type: "string",
      required: false,
      choices: ["stylish", "agent", "json"] as const,
      defaultValue: "stylish",
      description: "Output format",
    })
    .addExample({
      command: "avandar-lint coverage --format json src/",
      description: "Emit JSON coverage summary",
    })
    .action(onAction);

  return createCLI("avandar-lint")
    .description("Workspace linting tool")
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Verbose logging",
    })
    .addCommand("coverage", coverageCLI);
}

const SUBPROCESS_FIXTURE_SCRIPT = `
  import { Acclimate } from "./src/index";
  const coverage = Acclimate.createCLI("coverage")
    .description("Check coverage")
    .addPositionalArg({
      name: "paths",
      type: "string",
      required: true,
      variadic: true,
      description: "Paths to check",
    })
    .addOption({
      name: "--format",
      aliases: ["-f"],
      type: "string",
      required: false,
      choices: ["stylish", "json"],
      defaultValue: "stylish",
      description: "Output format",
    })
    .addExample("avandar-lint coverage src/")
    .action(({ paths, format }) => {
      console.log("ACTION_RAN:" + JSON.stringify({ paths, format }));
    });
  const root = Acclimate.createCLI("avandar-lint")
    .description("Workspace linter")
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"],
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Verbose output",
    })
    .addCommand("coverage", coverage);
  Acclimate.run(root);
`;

function _runAcclimateSubprocess(
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

  return new Promise((resolve, reject) => {
    execFile(
      tsxBin,
      ["-e", SUBPROCESS_FIXTURE_SCRIPT, "--", "avandar-lint", ...args],
      { cwd: process.cwd() },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        if (typeof error.code === "number") {
          resolve({ exitCode: error.code, stdout, stderr });
          return;
        }
        reject(new Error(error.message));
      },
    );
  });
}

describe("executeCLI", () => {
  it("writes help to stdout, leaves stderr empty, and returns exit code 0 for --help and -h", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);

    for (const input of [["--help"], ["coverage", "-h"]]) {
      const stdout = _createMemoryStream();
      const stderr = _createMemoryStream();

      const exitCode = await executeCLI({
        cli,
        input,
        stdout,
        stderr,
        onExitCode,
      });

      expect(exitCode).toBe(0);
      expect(stdout.getOutput()).toContain("avandar-lint");
      expect(stderr.getOutput()).toBe("");
    }

    expect(action).not.toHaveBeenCalled();
    expect(onExitCode).not.toHaveBeenCalled();
  });

  it("writes error, recovery hint, and usage to stderr and returns exit code 1 on unknown flag", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: ["coverage", "--bogus"],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(1);
    expect(onExitCode).toHaveBeenCalledWith(1);
    expect(action).not.toHaveBeenCalled();
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain(
      '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
    );
    expect(stderr.getOutput()).toContain(
      "⚠️ Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(stderr.getOutput()).toContain(
      "avandar-lint coverage [paths...] [options]",
    );
    expect(stderr.getOutput()).toContain("--verbose, -v");
    expect(stderr.getOutput()).not.toContain("at tokenizeCLIInput");
  });

  it("returns 0 without invoking onExitCode when an action completes normally", async () => {
    const action = vi.fn<() => void>();
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = _makeCoverageCLI(action);
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: ["coverage", "src/a.ts"],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(0);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onExitCode).not.toHaveBeenCalled();
    expect(stderr.getOutput()).toBe("");
  });

  it("writes unexpected non-CLIError failures to stderr and returns exit code 1", async () => {
    const onExitCode = vi.fn<(exitCode: number) => void>();
    const cli = createCLI("boom").action(() => {
      throw new Error("unexpected runtime failure");
    });
    const stdout = _createMemoryStream();
    const stderr = _createMemoryStream();

    const exitCode = await executeCLI({
      cli,
      input: [],
      stdout,
      stderr,
      onExitCode,
    });

    expect(exitCode).toBe(1);
    expect(onExitCode).toHaveBeenCalledWith(1);
    expect(stdout.getOutput()).toBe("");
    expect(stderr.getOutput()).toContain("unexpected runtime failure");
  });

  it("exits 0 with help on stdout and empty stderr when Acclimate.run receives --help or subcommand -h", async () => {
    const rootHelp = await _runAcclimateSubprocess(["--help"]);
    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout).toContain("avandar-lint");
    expect(rootHelp.stdout).toContain("Workspace linter");
    expect(rootHelp.stdout).not.toContain("ACTION_RAN");
    expect(rootHelp.stderr).toBe("");

    const subHelp = await _runAcclimateSubprocess(["coverage", "-h"]);
    expect(subHelp.exitCode).toBe(0);
    expect(subHelp.stdout).toContain("avandar-lint coverage");
    expect(subHelp.stdout).toContain("--verbose, -v");
    expect(subHelp.stdout).toContain("avandar-lint coverage src/");
    expect(subHelp.stdout).not.toContain("ACTION_RAN");
    expect(subHelp.stderr).toBe("");
  });

  it("exits 1 with error, recovery hint, and usage on stderr and empty stdout when Acclimate.run receives an unknown flag", async () => {
    const result = await _runAcclimateSubprocess(["coverage", "--bogus"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
    );
    expect(result.stderr).toContain(
      "⚠️ Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(result.stderr).toContain(
      "avandar-lint coverage <paths...> [options]",
    );
    expect(result.stderr).not.toContain("ACTION_RAN");
    expect(result.stderr).not.toContain("UnhandledPromiseRejection");
  });
});
