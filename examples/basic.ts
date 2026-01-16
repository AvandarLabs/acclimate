import { Acclimate } from "../src/Acclimate";

const DevDbCLI = Acclimate.createCLI("db").description("Database tools");
const DevWebCLI = Acclimate.createCLI("web").description("Web tools");

const SubCommandCLI = Acclimate.createCLI("dev")
  .description("Run the dev workflow")
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
    defaultValue: 1,
    description: "Number of cycles",
  })
  .addOption({
    name: "--mode",
    aliases: ["-m"],
    type: "string",
    required: false,
    defaultValue: "standard",
    description: "Execution mode",
  })
  .addOption({
    name: "--verbose",
    aliases: ["-v"],
    type: "boolean",
    required: false,
    description: "Verbose output",
  })
  .addOption({
    name: "--dry-run",
    aliases: ["-d"],
    type: "boolean",
    required: false,
    description: "Skip execution",
  })
  .addGlobalOption({
    name: "--env",
    aliases: ["-e"],
    type: "string",
    required: false,
    defaultValue: "dev",
    description: "Environment",
  })
  .addCommand("db", DevDbCLI)
  .addCommand("web", DevWebCLI)
  .action(({ target, count, mode, verbose, dryRun, env }) => {
    const cycles = Math.max(1, count ?? 1);

    Acclimate.log("|cyan|Running program...|reset|");
    Acclimate.log("|gray|Target: $target$ · Env: $env$ · Mode: $mode$|reset|", {
      target,
      env,
      mode,
    });
    Acclimate.log("|gray|Cycles: $count$|reset|", { count: String(cycles) });

    if (verbose) {
      Acclimate.log("|bright_black|Verbose output enabled.|reset|");
    }

    if (dryRun) {
      Acclimate.log("|yellow|Dry run: skipping execution.|reset|");
      return;
    }

    for (let i = 0; i < cycles; i += 1) {
      Acclimate.log("|gray|Sleeping...|reset|");
    }

    Acclimate.log("|green|Done.|reset|");
  });

const cli = Acclimate.createCLI("demo-cli")
  .description("This is a demo CLI")
  .addCommand("dev", SubCommandCLI);

Acclimate.run(cli);
