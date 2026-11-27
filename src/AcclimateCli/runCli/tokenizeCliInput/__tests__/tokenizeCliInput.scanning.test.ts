import { describe, expect, it } from "vitest";
import { createCli } from "@/AcclimateCli/createCli/createCli";
import { CliError } from "@/CliError";
import { tokenizeCliInput } from "../tokenizeCliInput";

function _expectCliErrorCode(
  action: () => unknown,
  expectedCode: string,
): CliError {
  let caughtError: unknown;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CliError);
  if (!(caughtError instanceof CliError)) {
    throw new Error("Expected CliError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}

function _makeCoverageRootCli() {
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
      defaultValue: "stylish",
    })
    .addOption({
      name: "--no-prompt",
      aliases: ["-P"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
    })
    .addOption({
      name: "--threshold",
      aliases: ["-t"] as const,
      type: "number",
      required: false,
    });

  return createCli("avandar-lint")
    .addGlobalOption({
      name: "--verbose",
      aliases: ["-v"] as const,
      type: "boolean",
      required: false,
      defaultValue: false,
    })
    .addGlobalOption({
      name: "--config",
      aliases: ["-c"] as const,
      type: "string",
      required: false,
    })
    .addCommand("coverage", coverageCli);
}

describe("tokenizeCliInput", () => {
  it("collects positional args interleaved before, between, and after flags", () => {
    const rootCli = _makeCoverageRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: [
        "coverage",
        "src/a.ts",
        "--format",
        "json",
        "src/b.ts",
        "--no-prompt",
        "src/c.ts",
      ],
    });

    expect(result.targetCli.getName()).toBe("coverage");
    expect(result.rawPositionalArgs).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result.rawOptionArgs).toEqual({
      "--format": "json",
      "--no-prompt": "",
    });
    expect(result.rawGlobalOptionArgs).toEqual({});
  });

  it("does not consume a following positional arg after a boolean flag", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--no-prompt",
        type: "boolean",
        required: false,
      })
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      });

    const result = tokenizeCliInput({
      cli,
      input: ["--no-prompt", "src/a.ts", "src/b.ts"],
    });

    expect(result.rawOptionArgs).toEqual({ "--no-prompt": "" });
    expect(result.rawPositionalArgs).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("consumes exactly one value token for string and number options", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--format",
        aliases: ["-f"] as const,
        type: "string",
        required: false,
      })
      .addOption({
        name: "--limit",
        aliases: ["-l"] as const,
        type: "number",
        required: false,
      });

    const result = tokenizeCliInput({
      cli,
      input: ["-f", "json", "extra-one", "-l", "10", "extra-two"],
    });

    expect(result.rawOptionArgs).toEqual({
      "--format": "json",
      "--limit": "10",
    });
    expect(result.rawPositionalArgs).toEqual(["extra-one", "extra-two"]);
  });

  it("splits inline --option=value and -a=value on the first equals sign", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--define",
        aliases: ["-d"] as const,
        type: "string",
        required: false,
      })
      .addOption({
        name: "--empty",
        type: "string",
        required: false,
      })
      .addOption({
        name: "--strict",
        type: "boolean",
        required: false,
      });

    const result = tokenizeCliInput({
      cli,
      input: ["-d=NODE_ENV=test", "--empty=", "--strict=false", "src/index.ts"],
    });

    expect(result.rawOptionArgs).toEqual({
      "--define": "NODE_ENV=test",
      "--empty": "",
      "--strict": "false",
    });
    expect(result.rawPositionalArgs).toEqual(["src/index.ts"]);
  });

  it("treats all tokens after -- as positional arguments including flags and another --", () => {
    const rootCli = _makeCoverageRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: [
        "coverage",
        "--format",
        "agent",
        "--",
        "--not-a-flag",
        "-x",
        "--",
        "src/file.ts",
      ],
    });

    expect(result.rawOptionArgs).toEqual({ "--format": "agent" });
    expect(result.rawPositionalArgs).toEqual([
      "--not-a-flag",
      "-x",
      "--",
      "src/file.ts",
    ]);
  });

  it("does not dispatch a subcommand name that appears after --", () => {
    const rootCli = _makeCoverageRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["--", "coverage", "src/a.ts"],
    });

    expect(result.targetCli.getName()).toBe("avandar-lint");
    expect(result.rawPositionalArgs).toEqual(["coverage", "src/a.ts"]);
  });

  it("treats lone hyphen as an option value or positional argument", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--output",
        type: "string",
        required: false,
      })
      .addPositionalArg({
        name: "inputs",
        type: "string",
        required: false,
        variadic: true,
      });

    const result = tokenizeCliInput({
      cli,
      input: ["--output", "-", "a.ts", "-"],
    });

    expect(result.rawOptionArgs).toEqual({ "--output": "-" });
    expect(result.rawPositionalArgs).toEqual(["a.ts", "-"]);
  });

  it("treats unregistered negative numbers as values or positional args while respecting registered aliases", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--offset",
        type: "number",
        required: false,
      })
      .addOption({
        name: "--single-column",
        aliases: ["-1"] as const,
        type: "boolean",
        required: false,
      });

    const result = tokenizeCliInput({
      cli,
      input: ["--offset", "-5", "-1", "-3.5"],
    });

    expect(result.rawOptionArgs).toEqual({
      "--offset": "-5",
      "--single-column": "",
    });
    expect(result.rawPositionalArgs).toEqual(["-3.5"]);
  });

  it("throws unknown_option for unrecognized flags before --", () => {
    const cli = createCli("tool").addOption({
      name: "--format",
      type: "string",
      required: false,
    });

    const flagError = _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["--unknown", "src/a.ts"] });
    }, "unknown_option");
    expect(flagError.message).toContain("--unknown");

    const inlineError = _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["--unknown=value"] });
    }, "unknown_option");
    expect(inlineError.message).toContain("--unknown");
  });

  it("throws missing_option_value when a value option ends input or precedes -- or another flag", () => {
    const cli = createCli("tool")
      .addOption({
        name: "--format",
        aliases: ["-f"] as const,
        type: "string",
        required: false,
      })
      .addOption({
        name: "--no-prompt",
        type: "boolean",
        required: false,
      });

    _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["--format"] });
    }, "missing_option_value");

    _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["-f", "--", "src/a.ts"] });
    }, "missing_option_value");

    _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["--format", "--no-prompt"] });
    }, "missing_option_value");

    _expectCliErrorCode(() => {
      tokenizeCliInput({ cli, input: ["--format", "--unknown"] });
    }, "missing_option_value");
  });

  it("carries parent global options passed before a subcommand and lets subcommand occurrences override them", () => {
    const rootCli = _makeCoverageRootCli();

    const result = tokenizeCliInput({
      cli: rootCli,
      input: [
        "-v",
        "--config",
        "root.json",
        "coverage",
        "src/a.ts",
        "-c",
        "override.json",
      ],
    });

    expect(result.targetCli.getName()).toBe("coverage");
    expect(result.rawPositionalArgs).toEqual(["src/a.ts"]);
    expect(result.rawGlobalOptionArgs).toEqual({
      "--verbose": "",
      "--config": "override.json",
    });
  });

  it("descends through deeply nested subcommands while preserving interleaved local and global options", () => {
    const newModelCli = createCli("new")
      .addPositionalArg({
        name: "modelName",
        type: "string",
        required: true,
      })
      .addOption({
        name: "--path",
        aliases: ["-p"] as const,
        type: "string",
        required: false,
      });
    const modelsCli = createCli("models").addCommand("new", newModelCli);
    const devCli = createCli("dev").addCommand("models", modelsCli);
    const rootCli = createCli("root")
      .addGlobalOption({
        name: "--env",
        aliases: ["-e"] as const,
        type: "string",
        required: false,
      })
      .addCommand("dev", devCli);

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["-e", "prod", "dev", "models", "new", "-p", "./out", "Dashboard"],
    });

    expect(result.targetCli.getName()).toBe("new");
    expect(result.rawPositionalArgs).toEqual(["Dashboard"]);
    expect(result.rawOptionArgs).toEqual({ "--path": "./out" });
    expect(result.rawGlobalOptionArgs).toEqual({ "--env": "prod" });
  });

  it("does not descend into a subcommand after a root-only local option is passed", () => {
    const childCli = createCli("run");
    const rootCli = createCli("root")
      .addOption({
        name: "--root-only",
        type: "boolean",
        required: false,
      })
      .addCommand("run", childCli);

    const result = tokenizeCliInput({
      cli: rootCli,
      input: ["--root-only", "run"],
    });

    expect(result.targetCli.getName()).toBe("root");
    expect(result.rawOptionArgs).toEqual({ "--root-only": "" });
    expect(result.rawPositionalArgs).toEqual(["run"]);
  });
});
