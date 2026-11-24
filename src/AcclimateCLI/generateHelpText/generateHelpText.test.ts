import { describe, expect, it } from "vitest";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { createCLI } from "../createCLI";
import { generateHelpText } from "./generateHelpText";

describe("generateHelpText", () => {
  it("formats the name and description, omitting empty sections", () => {
    const cli = createCLI("acclimate").description("A friendly CLI");

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        "|bright_cyan|acclimate|reset|\n" + "  |gray|A friendly CLI|reset|",
      ),
    );
  });

  it("includes parameter metadata with required and defaults", () => {
    const cli = createCLI("acclimate")
      .description("A friendly CLI")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        description: "Target to run",
      })
      .addPositionalArg({
        name: "count",
        type: "number",
        required: false,
        defaultValue: 2,
        description: "Run count",
      })
      .addOption({
        name: "--verbose",
        aliases: ["-v"],
        type: "boolean",
        required: false,
        description: "Verbose output",
      })
      .addOption({
        name: "--mode",
        aliases: ["-m"],
        type: "string",
        required: true,
        description: "Mode",
      })
      .addGlobalOption({
        name: "--env",
        aliases: ["-e"],
        type: "string",
        required: false,
        defaultValue: "dev",
        description: "Environment",
      });

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        "|bright_cyan|acclimate|reset|\n" +
          "  |gray|A friendly CLI|reset|\n" +
          "\n" +
          "|bright_yellow|Positional Arguments|reset|\n" +
          "  |bright_white|target|reset| (string)|reset| |red|required|reset| - |gray|Target to run|reset|\n" +
          "  |bright_white|count|reset| (number)|reset| |gray|optional|reset| - |gray|Run count|reset| |gray|[default: 2]|reset|\n" +
          "\n" +
          "|bright_yellow|Options|reset|\n" +
          "  |bright_white|--verbose, -v|reset| (boolean)|reset| |gray|optional|reset| - |gray|Verbose output|reset|\n" +
          "  |bright_white|--mode, -m|reset| (string)|reset| |red|required|reset| - |gray|Mode|reset|\n" +
          "\n" +
          "|bright_yellow|Global Options|reset|\n" +
          '  |bright_white|--env, -e|reset| (string)|reset| |gray|optional|reset| - |gray|Environment|reset| |gray|[default: "dev"]|reset|',
      ),
    );
  });

  it("lists commands alphabetically and appends sub-command help text", () => {
    const alpha = createCLI("alpha").description("Alpha command");
    const beta = createCLI("beta").description("Beta command");

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("beta", beta)
      .addCommand("alpha", alpha);

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        "|bright_cyan|root|reset|\n" +
          "  |gray|Root CLI|reset|\n" +
          "\n" +
          "|bright_yellow|Commands|reset|\n" +
          "\n" +
          "    |bright_cyan|alpha|reset|\n" +
          "      |gray|Alpha command|reset|\n" +
          "\n" +
          "    |bright_cyan|beta|reset|\n" +
          "      |gray|Beta command|reset|",
      ),
    );
  });

  it("lists commands as bullets at level 2 with descriptions", () => {
    const dev = createCLI("dev")
      .description("Dev workflow")
      .addCommand("web", createCLI("web").description("Web server"))
      .addCommand("db", createCLI("db").description("Database"));

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("dev", dev);

    const helpText = generateHelpText(cli);

    // Should have Commands header followed directly by bullets
    expect(helpText).toContain(
      generateTerminalMessage("|bright_yellow|Commands|reset|"),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|db|reset| - |gray|Database|reset|",
      ),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|web|reset| - |gray|Web server|reset|",
      ),
    );
    // Should not have "Available Commands:" header
    expect(helpText).not.toContain("Available Commands:");
    // Should not render full sub-command headers at level 3
    expect(helpText).not.toContain(
      generateTerminalMessage("|bright_cyan|db|reset|"),
    );
    expect(helpText).not.toContain(
      generateTerminalMessage("|bright_cyan|web|reset|"),
    );
  });

  it("shows 'No description' for commands without descriptions at level 2", () => {
    const dev = createCLI("dev")
      .description("Dev workflow")
      .addCommand("web", createCLI("web"))
      .addCommand("db", createCLI("db"));

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("dev", dev);

    const helpText = generateHelpText(cli);

    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|db|reset| - |dim|No description|reset|",
      ),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|web|reset| - |dim|No description|reset|",
      ),
    );
  });

  it("renders variadic positional args with ellipsis suffix and array type label", () => {
    const cli = createCLI("lint")
      .description("Lint workspace files")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        description: "Primary target",
      })
      .addPositionalArg({
        name: "paths",
        type: "string",
        required: false,
        variadic: true,
        defaultValue: ["."],
        description: "Additional paths",
      });

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|lint|reset|",
          "  |gray|Lint workspace files|reset|",
          "",
          "|bright_yellow|Positional Arguments|reset|",
          "  |bright_white|target|reset| (string)|reset| |red|required|reset| - |gray|Primary target|reset|",
          '  |bright_white|paths...|reset| (string[])|reset| |gray|optional|reset| - |gray|Additional paths|reset| |gray|[default: ["."]]|reset|',
        ].join("\n"),
      ),
    );
  });

  it("renders required variadic positional args with required label and array type", () => {
    const cli = createCLI("sum").addPositionalArg({
      name: "numbers",
      type: "number",
      required: true,
      variadic: true,
      description: "Numbers to add",
    });

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|sum|reset|",
          "",
          "|bright_yellow|Positional Arguments|reset|",
          "  |bright_white|numbers...|reset| (number[])|reset| |red|required|reset| - |gray|Numbers to add|reset|",
        ].join("\n"),
      ),
    );
  });
});
