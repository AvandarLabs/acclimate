import { execFile } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

function _runTsxScript(options: {
  script: string;
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

  return new Promise((resolve, reject) => {
    execFile(
      tsxBin,
      ["-e", options.script, "--", ...options.argv],
      { cwd: process.cwd(), env: { ...process.env, ...options.env } },
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

describe("executeCLI - subprocess boundary", () => {
  it("exits 0 with help on stdout and empty stderr when Acclimate.run receives --help or subcommand -h", async () => {
    const rootHelp = await _runTsxScript({
      script: SUBPROCESS_FIXTURE_SCRIPT,
      argv: ["avandar-lint", "--help"],
    });
    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout).toContain("avandar-lint");
    expect(rootHelp.stdout).toContain("Workspace linter");
    expect(rootHelp.stdout).not.toContain("ACTION_RAN");
    expect(rootHelp.stdout).not.toContain("\x1b[");
    expect(rootHelp.stderr).toBe("");

    const subHelp = await _runTsxScript({
      script: SUBPROCESS_FIXTURE_SCRIPT,
      argv: ["avandar-lint", "coverage", "-h"],
    });
    expect(subHelp.exitCode).toBe(0);
    expect(subHelp.stdout).toContain("avandar-lint coverage");
    expect(subHelp.stdout).toContain("--verbose, -v");
    expect(subHelp.stdout).toContain("avandar-lint coverage src/");
    expect(subHelp.stdout).not.toContain("ACTION_RAN");
    expect(subHelp.stdout).not.toContain("\x1b[");
    expect(subHelp.stderr).toBe("");
  });

  it("exits 1 with error, recovery hint, and usage on stderr and empty stdout when Acclimate.run receives an unknown flag", async () => {
    const result = await _runTsxScript({
      script: SUBPROCESS_FIXTURE_SCRIPT,
      argv: ["avandar-lint", "coverage", "--bogus"],
    });

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
    expect(result.stderr).not.toContain("\x1b[");
    expect(result.stderr).not.toContain("ACTION_RAN");
    expect(result.stderr).not.toContain("UnhandledPromiseRejection");
  });

  it("keeps JSON stdout clean when Acclimate.log writes diagnostics and fails fast on unattended required askIfEmpty", async () => {
    const jsonScript = `
      import { Acclimate } from "./src/index";
      const cli = Acclimate.createCLI("report")
        .addOption({
          name: "--format",
          type: "string",
          required: false,
          choices: ["stylish", "json"],
          defaultValue: "json",
          askIfEmpty: true,
        })
        .action(({ format }) => {
          Acclimate.log("|cyan|Building report...|reset|");
          Acclimate.writeJson({ format, status: "ok" });
        });
      Acclimate.run(cli);
    `;

    const jsonResult = await _runTsxScript({
      script: jsonScript,
      argv: ["report"],
    });
    expect(jsonResult.exitCode).toBe(0);
    expect(JSON.parse(jsonResult.stdout)).toEqual({
      format: "json",
      status: "ok",
    });
    expect(jsonResult.stderr).toContain("Building report...");
    expect(jsonResult.stderr).not.toContain("\x1b[");

    const unattendedRequiredScript = `
      import { Acclimate } from "./src/index";
      const cli = Acclimate.createCLI("deploy")
        .addOption({
          name: "--env",
          type: "string",
          required: true,
          choices: ["dev", "prod"],
          askIfEmpty: true,
        })
        .action(({ env }) => {
          Acclimate.writeJson({ env });
        });
      Acclimate.run(cli);
    `;

    const failResult = await _runTsxScript({
      script: unattendedRequiredScript,
      argv: ["deploy"],
    });
    expect(failResult.exitCode).toBe(1);
    expect(failResult.stdout).toBe("");
    expect(failResult.stderr).toContain("--env");
    expect(failResult.stderr).toContain("deploy --env");
    expect(failResult.stderr).not.toContain("\x1b[");
  });

  it("preserves text, emoji, and recovery guidance with zero ANSI escapes under NO_COLOR=1 and TERM=dumb", async () => {
    const statusScript = `
      import { Acclimate } from "./src/index";
      const cli = Acclimate.createCLI("check").action(() => {
        Acclimate.printInfo("Running checks");
        Acclimate.printError("Check failed", { hint: "Run check --fix." });
        Acclimate.writeJson({ ok: false });
      });
      void Acclimate.run(cli);
    `;

    for (const env of [{ NO_COLOR: "1" }, { TERM: "dumb" }]) {
      const result = await _runTsxScript({
        script: statusScript,
        argv: ["check"],
        env,
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ ok: false });
      expect(result.stderr).toContain("ℹ️ Running checks");
      expect(result.stderr).toContain("❌ Check failed");
      expect(result.stderr).toContain("  ⚠️ Run check --fix.");
      expect(result.stderr).not.toContain("\x1b[");
    }
  });
});
