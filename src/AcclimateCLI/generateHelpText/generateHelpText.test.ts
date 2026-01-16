import { describe, expect, it } from "vitest";
import { createCLI } from "../createCLI";
import { generateHelpText } from "./generateHelpText";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";

describe("generateHelpText", () => {
  it("formats the name, description, and empty sections", () => {
    const cli = createCLI("acclimate").description("A friendly CLI");

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        "|bright_cyan|acclimate|reset|\n" +
          "  |gray|A friendly CLI|reset|\n" +
          "\n" +
          "|bright_yellow|Positional Arguments|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Options|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Global Options|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Commands|reset|\n" +
          "  |gray|None|reset|",
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
          "  |bright_white|--env, -e|reset| (string)|reset| |gray|optional|reset| - |gray|Environment|reset| |gray|[default: \"dev\"]|reset|\n" +
          "\n" +
          "|bright_yellow|Commands|reset|\n" +
          "  |gray|None|reset|",
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
          "|bright_yellow|Positional Arguments|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Options|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Global Options|reset|\n" +
          "  |gray|None|reset|\n" +
          "\n" +
          "|bright_yellow|Commands|reset|\n" +
          "  |bright_white|alpha|reset| - |gray|Alpha command|reset|\n" +
          "  |bright_white|beta|reset| - |gray|Beta command|reset|\n" +
          "\n" +
          "    |bright_cyan|alpha|reset|\n" +
          "      |gray|Alpha command|reset|\n" +
          "\n" +
          "    |bright_yellow|Positional Arguments|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Options|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Global Options|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Commands|reset|\n" +
          "      |bright_yellow|Available Commands:|reset| |gray|None|reset|\n" +
          "\n" +
          "    |bright_cyan|beta|reset|\n" +
          "      |gray|Beta command|reset|\n" +
          "\n" +
          "    |bright_yellow|Positional Arguments|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Options|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Global Options|reset|\n" +
          "      |gray|None|reset|\n" +
          "\n" +
          "    |bright_yellow|Commands|reset|\n" +
          "      |bright_yellow|Available Commands:|reset| |gray|None|reset|",
      ),
    );
  });

  it("lists available commands at level 2 without further recursion", () => {
    const dev = createCLI("dev")
      .description("Dev workflow")
      .addCommand("web", createCLI("web").description("Web server"))
      .addCommand("db", createCLI("db").description("Database"));

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("dev", dev);

    const helpText = generateHelpText(cli);

    expect(helpText).toContain(
      generateTerminalMessage(
        "|bright_yellow|Available Commands:|reset| |gray|db, web|reset|",
      ),
    );
    expect(helpText).not.toContain(
      generateTerminalMessage("|bright_cyan|db|reset|"),
    );
    expect(helpText).not.toContain(
      generateTerminalMessage("|bright_cyan|web|reset|"),
    );
  });
});
