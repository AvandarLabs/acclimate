import { describe, expect, expectTypeOf, it } from "vitest";
import { CLIError } from "@/CLIError";
import { createCLI } from "./createCLI";

function _expectCLIErrorCode(
  action: () => unknown,
  expectedCode: string,
): CLIError {
  let caughtError: unknown;
  try {
    action();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(CLIError);
  if (!(caughtError instanceof CLIError)) {
    throw new Error("Expected CLIError to be thrown");
  }
  expect(caughtError.code).toBe(expectedCode);
  return caughtError;
}

describe("CLIError", () => {
  it("sets code missing_option_value when created via missingOptionValue", () => {
    const error = CLIError.missingOptionValue({
      cliName: "demo",
      optionName: "--format",
    });

    expect(error).toBeInstanceOf(CLIError);
    expect(error.code).toBe("missing_option_value");
    expect(error.message).toContain("--format");
  });

  it("exposes code invalid_positional_arg_config on positional config error", () => {
    const error = CLIError.invalidPositionalArgConfig({
      cliName: "demo",
      positionalArgName: "must",
    });

    expect(error.code).toBe("invalid_positional_arg_config");
  });

  it("formats unknownOption with a clear message and cliName", () => {
    const error = CLIError.unknownOption({
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
    const original = CLIError.unknownOption({
      cliName: "coverage",
      optionName: "--bogus",
    });

    const enriched = original.withHelpContext({
      commandPath: ["avandar-lint", "coverage"],
      hint: "Run avandar-lint coverage --help to see available options and usage.",
      usage:
        "avandar-lint coverage\n\nUsage\n  avandar-lint coverage [options]",
    });

    expect(enriched).toBeInstanceOf(CLIError);
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
});

describe("AcclimateCLI.addPositionalArg", () => {
  it("throws if adding a required arg after an optional arg", () => {
    const cli = createCLI("test-cli");

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
    const cli = createCLI("test-cli");

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
    const cli = createCLI("test-cli");

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
    const cli = createCLI("test-cli");

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
    const cli = createCLI("test-cli").addPositionalArg({
      name: "paths",
      type: "string",
      required: false,
      variadic: true,
    });

    const error = _expectCLIErrorCode(() => {
      cli.addPositionalArg({
        name: "extra",
        type: "string",
        required: false,
      });
    }, "invalid_positional_arg_config");

    expect(error.message).toContain("paths");
  });

  it("throws invalid_positional_arg_config when adding a second variadic arg", () => {
    const cli = createCLI("test-cli").addPositionalArg({
      name: "paths",
      type: "string",
      required: true,
      variadic: true,
    });

    _expectCLIErrorCode(() => {
      cli.addPositionalArg({
        name: "more",
        type: "string",
        required: false,
        variadic: true,
      });
    }, "invalid_positional_arg_config");
  });

  it("throws invalid_positional_arg_config when adding a required variadic arg after an optional arg", () => {
    const cli = createCLI("test-cli").addPositionalArg({
      name: "maybe",
      type: "string",
      required: false,
    });

    _expectCLIErrorCode(() => {
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
      createCLI("test-cli")
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
      createCLI("test-cli")
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
    const cli = createCLI("typed-cli")
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
    const cli = createCLI("typed-variadic-choices")
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
    const numericCLI = createCLI("typed-numbers")
      .addPositionalArg({
        name: "ports",
        type: "number",
        required: true,
        variadic: true,
      })
      .action((args) => {
        expectTypeOf(args.ports).toEqualTypeOf<number[]>();
      });

    const booleanCLI = createCLI("typed-booleans")
      .addPositionalArg({
        name: "flags",
        type: "boolean",
        required: false,
        variadic: true,
      })
      .action((args) => {
        expectTypeOf(args.flags).toEqualTypeOf<boolean[]>();
      });

    expect(numericCLI.state.positionalArgs).toHaveLength(1);
    expect(booleanCLI.state.positionalArgs).toHaveLength(1);
  });
});

describe("AcclimateCLI metadata builders", () => {
  it("stores custom usage text immutably without mutating the original CLI", () => {
    const baseCLI = createCLI("demo").description("Demo tool");
    const customCLI = baseCLI.usage("demo [files...] [options]");

    expect(baseCLI.state.usage).toBeUndefined();
    expect(customCLI.state.usage).toBe("demo [files...] [options]");
  });

  it("appends string and structured examples immutably in declaration order", () => {
    const baseCLI = createCLI("demo");
    const withOne = baseCLI.addExample("demo src/");
    const withTwo = withOne.addExample({
      command: "demo --format json src/",
      description: "Emit JSON output",
    });

    expect(baseCLI.state.examples).toEqual([]);
    expect(withOne.state.examples).toEqual(["demo src/"]);
    expect(withTwo.state.examples).toEqual([
      "demo src/",
      { command: "demo --format json src/", description: "Emit JSON output" },
    ]);
  });

  it("preserves argument type inference across usage, addExample, and async actions", () => {
    const cli = createCLI("demo")
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
