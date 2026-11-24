import { describe, expect, it } from "vitest";
import { generateTerminalMessage } from "@/generateTerminalMessage/generateTerminalMessage";
import { createCLI } from "../createCLI";
import { generateHelpText } from "./generateHelpText";

describe("generateHelpText", () => {
  it("formats name, description, auto-generated usage, and built-in help option", () => {
    const cli = createCLI("acclimate").description("A friendly CLI");

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|acclimate|reset|",
          "  |gray|A friendly CLI|reset|",
          "",
          "|bright_yellow|Usage|reset|",
          "  acclimate [options]",
          "",
          "|bright_yellow|Options|reset|",
          "  |bright_white|--help, -h|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
        ].join("\n"),
      ),
    );
  });

  it("includes positional args, options, global options, choices, and defaults", () => {
    const cli = createCLI("acclimate")
      .description("A friendly CLI")
      .addPositionalArg({
        name: "target",
        type: "string",
        required: true,
        choices: ["web", "api"] as const,
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
        choices: ["fast", "strict"] as const,
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
        [
          "|bright_cyan|acclimate|reset|",
          "  |gray|A friendly CLI|reset|",
          "",
          "|bright_yellow|Usage|reset|",
          "  acclimate <target> [count] [options]",
          "",
          "|bright_yellow|Positional Arguments|reset|",
          "  |bright_white|target|reset| (string) |red|required|reset| - |gray|Target to run|reset| |gray|[choices: web | api]|reset|",
          "  |bright_white|count|reset| (number) |gray|optional|reset| - |gray|Run count|reset| |gray|[default: 2]|reset|",
          "",
          "|bright_yellow|Options|reset|",
          "  |bright_white|--verbose, -v|reset| (boolean) |gray|optional|reset| - |gray|Verbose output|reset|",
          "  |bright_white|--mode, -m|reset| (string) |red|required|reset| - |gray|Mode|reset| |gray|[choices: fast | strict]|reset|",
          "  |bright_white|--help, -h|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
          "",
          "|bright_yellow|Global Options|reset|",
          '  |bright_white|--env, -e|reset| (string) |gray|optional|reset| - |gray|Environment|reset| |gray|[default: "dev"]|reset|',
        ].join("\n"),
      ),
    );
  });

  it("lists commands alphabetically without repeating built-in help on subcommands", () => {
    const alpha = createCLI("alpha").description("Alpha command");
    const beta = createCLI("beta").description("Beta command");

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("beta", beta)
      .addCommand("alpha", alpha);

    expect(generateHelpText(cli)).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|root|reset|",
          "  |gray|Root CLI|reset|",
          "",
          "|bright_yellow|Usage|reset|",
          "  root <command> [options]",
          "",
          "|bright_yellow|Options|reset|",
          "  |bright_white|--help, -h|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
          "",
          "|bright_yellow|Commands|reset|",
          "",
          "    |bright_cyan|alpha|reset|",
          "      |gray|Alpha command|reset|",
          "",
          "    |bright_cyan|beta|reset|",
          "      |gray|Beta command|reset|",
        ].join("\n"),
      ),
    );
  });

  it("uses [command] in synopsis when a parent CLI also defines an action", () => {
    const cli = createCLI("root")
      .addCommand("alpha", createCLI("alpha"))
      .action(() => {});

    expect(generateHelpText(cli)).toContain("  root [command] [options]");
  });

  it("lists commands as bullets at level 2 with descriptions and fallback", () => {
    const dev = createCLI("dev")
      .description("Dev workflow")
      .addCommand("web", createCLI("web").description("Web server"))
      .addCommand("db", createCLI("db"));

    const cli = createCLI("root")
      .description("Root CLI")
      .addCommand("dev", dev);

    const helpText = generateHelpText(cli);

    expect(helpText).toContain(
      generateTerminalMessage("|bright_yellow|Commands|reset|"),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|db|reset| - |dim|No description|reset|",
      ),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "• |bright_white|web|reset| - |gray|Web server|reset|",
      ),
    );
    expect(helpText).not.toContain(
      generateTerminalMessage("|bright_cyan|db|reset|"),
    );
  });

  it("renders variadic positional args in both synopsis and positional section", () => {
    const optionalCLI = createCLI("lint")
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

    expect(generateHelpText(optionalCLI)).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|lint|reset|",
          "  |gray|Lint workspace files|reset|",
          "",
          "|bright_yellow|Usage|reset|",
          "  lint <target> [paths...] [options]",
          "",
          "|bright_yellow|Positional Arguments|reset|",
          "  |bright_white|target|reset| (string) |red|required|reset| - |gray|Primary target|reset|",
          '  |bright_white|paths...|reset| (string[]) |gray|optional|reset| - |gray|Additional paths|reset| |gray|[default: ["."]]|reset|',
          "",
          "|bright_yellow|Options|reset|",
          "  |bright_white|--help, -h|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
        ].join("\n"),
      ),
    );

    const requiredCLI = createCLI("sum").addPositionalArg({
      name: "numbers",
      type: "number",
      required: true,
      variadic: true,
      description: "Numbers to add",
    });

    expect(generateHelpText(requiredCLI)).toContain(
      "  sum <numbers...> [options]",
    );
    expect(generateHelpText(requiredCLI)).toContain(
      generateTerminalMessage(
        "  |bright_white|numbers...|reset| (number[]) |red|required|reset| - |gray|Numbers to add|reset|",
      ),
    );
  });

  it("renders custom usage, commandPath, and string or structured examples", () => {
    const coverageCLI = createCLI("coverage")
      .description("Check test coverage")
      .usage("avandar-lint coverage [files...] [--format stylish|agent|json]")
      .addExample("avandar-lint coverage src/")
      .addExample({
        command: "avandar-lint coverage --format json src/a.ts",
        description: "Emit machine-readable JSON",
      });

    expect(
      generateHelpText(coverageCLI, {
        commandPath: ["avandar-lint", "coverage"],
      }),
    ).toBe(
      generateTerminalMessage(
        [
          "|bright_cyan|avandar-lint coverage|reset|",
          "  |gray|Check test coverage|reset|",
          "",
          "|bright_yellow|Usage|reset|",
          "  avandar-lint coverage [files...] [--format stylish|agent|json]",
          "",
          "|bright_yellow|Options|reset|",
          "  |bright_white|--help, -h|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
          "",
          "|bright_yellow|Examples|reset|",
          "  |bright_white|avandar-lint coverage src/|reset|",
          "  |bright_white|avandar-lint coverage --format json src/a.ts|reset| - |gray|Emit machine-readable JSON|reset|",
        ].join("\n"),
      ),
    );
  });

  it("omits -h from built-in help when -h is registered by another option", () => {
    const cli = createCLI("connect").addOption({
      name: "--host",
      aliases: ["-h"],
      type: "string",
      required: false,
      description: "Target host",
    });

    const helpText = generateHelpText(cli);

    expect(helpText).toContain(
      generateTerminalMessage(
        "  |bright_white|--host, -h|reset| (string) |gray|optional|reset| - |gray|Target host|reset|",
      ),
    );
    expect(helpText).toContain(
      generateTerminalMessage(
        "  |bright_white|--help|reset| (boolean) |gray|optional|reset| - |gray|Show help for this command|reset|",
      ),
    );
    expect(helpText).not.toContain("--help, -h");
  });

  it("does not duplicate --help when explicitly registered by the CLI", () => {
    const cli = createCLI("custom").addOption({
      name: "--help",
      type: "boolean",
      required: false,
      description: "Custom help handler",
    });

    const helpText = generateHelpText(cli);

    expect(helpText).toContain("Custom help handler");
    expect(helpText).not.toContain("Show help for this command");
  });
});
