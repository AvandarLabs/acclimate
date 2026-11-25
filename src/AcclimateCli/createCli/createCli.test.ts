import { describe, expect, expectTypeOf, it } from "vitest";
import { CliError } from "@/CliError";
import { createCli } from "./createCli";

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

describe("CliError", () => {
  it("sets code missing_option_value when created via missingOptionValue", () => {
    const error = CliError.missingOptionValue({
      cliName: "demo",
      optionName: "--format",
    });

    expect(error).toBeInstanceOf(CliError);
    expect(error.code).toBe("missing_option_value");
    expect(error.message).toContain("--format");
  });

  it("exposes code invalid_positional_arg_config on positional config error", () => {
    const error = CliError.invalidPositionalArgConfig({
      cliName: "demo",
      positionalArgName: "must",
    });

    expect(error.code).toBe("invalid_positional_arg_config");
  });

  it("formats unknownOption with a clear message and cliName", () => {
    const error = CliError.unknownOption({
      cliName: "avandar-lint coverage",
      optionName: "--bogus",
    });

    expect(error.code).toBe("unknown_option");
    expect(error.cliName).toBe("avandar-lint coverage");
    expect(error.message).toBe(
      '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
    );
  });

  it("attaches commandPath, hint, and usage immutably via withHelpContext", () => {
    const original = CliError.unknownOption({
      cliName: "coverage",
      optionName: "--bogus",
    });

    const enriched = original.withHelpContext({
      commandPath: ["avandar-lint", "coverage"],
      hint: "Run avandar-lint coverage --help to see available options and usage.",
      usage:
        "avandar-lint coverage\n\nUsage\n  avandar-lint coverage [options]",
    });

    expect(enriched).toBeInstanceOf(CliError);
    expect(enriched).not.toBe(original);
    expect(enriched.code).toBe("unknown_option");
    expect(enriched.cliName).toBe("avandar-lint coverage");
    expect(enriched.message).toBe(
      '❌ Error running avandar-lint coverage: Unknown option "--bogus"',
    );
    expect(enriched.commandPath).toEqual(["avandar-lint", "coverage"]);
    expect(enriched.hint).toBe(
      "Run avandar-lint coverage --help to see available options and usage.",
    );
    expect(enriched.usage).toContain("avandar-lint coverage [options]");
    expect(original.hint).toBeUndefined();
    expect(original.usage).toBeUndefined();
  });

  it("creates prompt_cancelled and interactive_input_unavailable CliErrors", () => {
    const cancelled = CliError.promptCancelled({ cliName: "avandar-lint" });
    expect(cancelled.code).toBe("prompt_cancelled");
    expect(cancelled.message).toContain("Cancelled");

    const unavailable = CliError.interactiveInputUnavailable({
      cliName: "avandar-lint",
      message: "Interactive prompt requires a TTY.",
      hint: "Pass --format <value> instead.",
    });
    expect(unavailable.code).toBe("interactive_input_unavailable");
    expect(unavailable.hint).toBe("Pass --format <value> instead.");
  });

  it("preserves explicit recovery hints on missing required option and positional errors", () => {
    const optionError = CliError.missingRequiredOption({
      cliName: "demo",
      optionName: "--format",
      hint: "Pass --format <value> (for example: demo --format <value>).",
    });
    expect(optionError.hint).toBe(
      "Pass --format <value> (for example: demo --format <value>).",
    );

    const positionalError = CliError.missingRequiredPositionalArg({
      cliName: "demo",
      positionalArgName: "target",
      hint: "Pass <target> (for example: demo <target>).",
    });
    expect(positionalError.hint).toBe(
      "Pass <target> (for example: demo <target>).",
    );
  });
});

describe("AcclimateCli.addPositionalArg", () => {
  it("throws if adding a required arg after an optional arg", () => {
    const cli = createCli("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "maybe",
          type: "string",
          required: false,
        })
        .addPositionalArg({
          name: "must",
          type: "string",
          required: true,
        });
    }).toThrowError();
  });

  it("does not throw when adding only optional positional args", () => {
    const cli = createCli("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "maybeOne",
          type: "string",
          required: false,
        })
        .addPositionalArg({
          name: "maybeTwo",
          type: "string",
          required: false,
        });
    }).not.toThrowError();
  });

  it("does not throw when adding only required positional args", () => {
    const cli = createCli("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "mustOne",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "mustTwo",
          type: "string",
          required: true,
        });
    }).not.toThrowError();
  });

  it("does not throw when adding an optional arg after a required arg", () => {
    const cli = createCli("test-cli");

    expect(() => {
      cli
        .addPositionalArg({
          name: "must",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "maybe",
          type: "string",
          required: false,
        });
    }).not.toThrowError();
  });

  it("throws invalid_positional_arg_config when adding a scalar arg after a variadic arg", () => {
    const cli = createCli("test-cli").addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
    });

    const error = _expectCliErrorCode(() => {
      cli.addPositionalArg({
        name: "extra",
        type: "string",
        required: false,
      });
    }, "invalid_positional_arg_config");

    expect(error.message).toContain("paths");
  });

  it("throws invalid_positional_arg_config when adding a second variadic arg", () => {
    const cli = createCli("test-cli").addPositionalArg({
      name: "paths",
      type: "string",
      required: true,
      variadic: true,
    });

    _expectCliErrorCode(() => {
      cli.addPositionalArg({
        name: "more",
        type: "string",
        required: false,
        variadic: true,
      });
    }, "invalid_positional_arg_config");
  });

  it("throws invalid_positional_arg_config when adding a required variadic arg after an optional arg", () => {
    const cli = createCli("test-cli").addPositionalArg({
      name: "maybe",
      type: "string",
      required: false,
    });

    _expectCliErrorCode(() => {
      cli.addPositionalArg({
        name: "paths",
        type: "string",
        required: true,
        variadic: true,
      });
    }, "invalid_positional_arg_config");
  });

  it("allows fixed positional args followed by a trailing variadic arg", () => {
    expect(() => {
      createCli("test-cli")
        .addPositionalArg({
          name: "target",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "paths",
          type: "string",
          required: false,
          variadic: true,
          defaultValue: ["."],
        });
    }).not.toThrowError();

    expect(() => {
      createCli("test-cli")
        .addPositionalArg({
          name: "target",
          type: "string",
          required: true,
        })
        .addPositionalArg({
          name: "ports",
          type: "number",
          required: true,
          variadic: true,
        });
    }).not.toThrowError();
  });

  it("infers array types for variadic args and scalar types for fixed args", () => {
    const cli = createCli("typed-cli")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
        defaultValue: ["."],
      })
      .addOption({
        name: "--format",
        type: "string",
        required: false,
        choices: ["stylish", "agent", "json"] as const,
      })
      .action((args) => {
        expectTypeOf(args.target).toEqualTypeOf<string>();
        expectTypeOf(args.paths).toEqualTypeOf<string[]>();
        expectTypeOf(args.format).toEqualTypeOf<"stylish" | "agent" | "json">();
      });

    expect(cli.state.positionalArgs).toHaveLength(2);
  });

  it("infers narrowed element array type when variadic choices uses as const", () => {
    const cli = createCli("typed-variadic-choices")
      .addPositionalArg({
        name: "modes",
        type: "string",
        required: false,
        variadic: true,
        choices: ["fast", "strict"] as const,
      })
      .action((args) => {
        expectTypeOf(args.modes).toEqualTypeOf<Array<"fast" | "strict">>();
      });

    expect(cli.state.positionalArgs).toHaveLength(1);
  });

  it("infers number[] and boolean[] for numeric and boolean variadic args", () => {
    const numericCli = createCli("typed-numbers")
      .addPositionalArg({
        name: "ports",
        type: "number",
        required: true,
        variadic: true,
      })
      .action((args) => {
        expectTypeOf(args.ports).toEqualTypeOf<number[]>();
      });

    const booleanCli = createCli("typed-booleans")
      .addPositionalArg({
        name: "flags",
        type: "boolean",
        required: false,
        variadic: true,
      })
      .action((args) => {
        expectTypeOf(args.flags).toEqualTypeOf<boolean[]>();
      });

    expect(numericCli.state.positionalArgs).toHaveLength(1);
    expect(booleanCli.state.positionalArgs).toHaveLength(1);
  });
});

describe("AcclimateCli metadata builders", () => {
  it("stores custom usage text immutably without mutating the original CLI", () => {
    const baseCli = createCli("demo").description("Demo tool");
    const customCli = baseCli.usage("demo [files...] [options]");

    expect(baseCli.state.usage).toBeUndefined();
    expect(customCli.state.usage).toBe("demo [files...] [options]");
  });

  it("appends string and structured examples immutably in declaration order", () => {
    const baseCli = createCli("demo");
    const withOne = baseCli.addExample("demo src/");
    const withTwo = withOne.addExample({
      command: "demo --format json src/",
      description: "Emit JSON output",
    });

    expect(baseCli.state.examples).toEqual([]);
    expect(withOne.state.examples).toEqual(["demo src/"]);
    expect(withTwo.state.examples).toEqual([
      "demo src/",
      { command: "demo --format json src/", description: "Emit JSON output" },
    ]);
  });

  it("preserves argument type inference across usage, addExample, and async actions", () => {
    const cli = createCli("demo")
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
      })
      .usage("demo [paths...]")
      .addExample("demo src/a.ts")
      .action(async (args) => {
        expectTypeOf(args.paths).toEqualTypeOf<string[]>();
        await Promise.resolve();
      });

    expect(cli.state.usage).toBe("demo [paths...]");
    expect(cli.state.examples).toHaveLength(1);
  });
});
