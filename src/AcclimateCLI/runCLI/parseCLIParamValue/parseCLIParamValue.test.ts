import { describe, expect, it } from "vitest";
import { CLIError } from "@/CLIError";
import { parseCLIParamValue } from "./parseCLIParamValue";

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

describe("parseCLIParamValue", () => {
  it("returns the raw string unchanged for a default string param", () => {
    const parsed = parseCLIParamValue({
      cliName: "lint",
      inputValue: "src/index.ts",
      defaultValue: undefined,
      paramConfig: { name: "path", type: "string" },
    });

    expect(parsed).toBe("src/index.ts");
  });

  it("converts positive and negative integer strings to numbers for a default number param", () => {
    const positive = parseCLIParamValue({
      cliName: "math",
      inputValue: "42",
      defaultValue: undefined,
      paramConfig: { name: "retries", type: "number" },
    });
    const negative = parseCLIParamValue({
      cliName: "math",
      inputValue: "-7",
      defaultValue: undefined,
      paramConfig: { name: "delta", type: "number" },
    });

    expect(positive).toBe(42);
    expect(negative).toBe(-7);
  });

  it("throws invalid_cli_param_value when default number parsing gets non-numeric input", () => {
    const error = _expectCLIErrorCode(() => {
      parseCLIParamValue({
        cliName: "math",
        inputValue: "not-a-number",
        defaultValue: undefined,
        paramConfig: { name: "port", type: "number" },
      });
    }, "invalid_cli_param_value");

    expect(error.message).toContain("port");
    expect(error.message).toContain("not-a-number");
  });

  it("returns false for 'false' and true for empty string or 'true' on a default boolean param", () => {
    const paramConfig = { name: "--verbose", type: "boolean" as const };

    expect(
      parseCLIParamValue({
        cliName: "lint",
        inputValue: "false",
        defaultValue: undefined,
        paramConfig,
      }),
    ).toBe(false);
    expect(
      parseCLIParamValue({
        cliName: "lint",
        inputValue: "",
        defaultValue: undefined,
        paramConfig,
      }),
    ).toBe(true);
    expect(
      parseCLIParamValue({
        cliName: "lint",
        inputValue: "true",
        defaultValue: undefined,
        paramConfig,
      }),
    ).toBe(true);
  });

  it("applies custom parser before choices and validator checks", () => {
    const parsed = parseCLIParamValue({
      cliName: "lint",
      inputValue: "  JSON  ",
      defaultValue: undefined,
      paramConfig: {
        name: "--format",
        type: "string",
        choices: ["stylish", "agent", "json"] as const,
        parser: (rawValue) => {
          return rawValue.trim().toLowerCase();
        },
        validator: (value) => {
          return value.length > 0;
        },
      },
    });

    expect(parsed).toBe("json");
  });

  it("throws invalid_cli_param_value listing choices when value is not an allowed choice", () => {
    const error = _expectCLIErrorCode(() => {
      parseCLIParamValue({
        cliName: "lint",
        inputValue: "xml",
        defaultValue: undefined,
        paramConfig: {
          name: "--format",
          type: "string",
          choices: ["stylish", "agent", "json"] as const,
        },
      });
    }, "invalid_cli_param_value");

    expect(error.message).toContain("stylish");
    expect(error.message).toContain("agent");
    expect(error.message).toContain("json");
  });

  it("throws invalid_cli_param_value with custom message when validator returns a string", () => {
    const error = _expectCLIErrorCode(() => {
      parseCLIParamValue({
        cliName: "serve",
        inputValue: "0",
        defaultValue: undefined,
        paramConfig: {
          name: "--port",
          type: "number",
          validator: (value) => {
            return value > 0 ? true : "Port must be positive";
          },
        },
      });
    }, "invalid_cli_param_value");

    expect(error.message).toContain("Port must be positive");
  });

  it("throws invalid_cli_param_value with default message when validator returns false", () => {
    const error = _expectCLIErrorCode(() => {
      parseCLIParamValue({
        cliName: "serve",
        inputValue: "-1",
        defaultValue: undefined,
        paramConfig: {
          name: "--age",
          type: "number",
          validator: (value) => {
            return value > 0;
          },
        },
      });
    }, "invalid_cli_param_value");

    expect(error.message).toContain("--age");
  });

  it("returns undefined when both inputValue and defaultValue are undefined", () => {
    const parsed = parseCLIParamValue({
      cliName: "lint",
      inputValue: undefined,
      defaultValue: undefined,
      paramConfig: { name: "--format", type: "string" },
    });

    expect(parsed).toBeUndefined();
  });

  it("returns defaultValue when allowed and throws invalid_cli_param_value when outside choices", () => {
    const valid = parseCLIParamValue({
      cliName: "lint",
      inputValue: undefined,
      defaultValue: "stylish",
      paramConfig: {
        name: "--format",
        type: "string",
        choices: ["stylish", "agent", "json"] as const,
      },
    });
    expect(valid).toBe("stylish");

    _expectCLIErrorCode(() => {
      parseCLIParamValue({
        cliName: "lint",
        inputValue: undefined,
        defaultValue: "invalid",
        paramConfig: {
          name: "--format",
          type: "string",
          choices: ["stylish", "agent", "json"] as const,
        },
      });
    }, "invalid_cli_param_value");
  });
});
