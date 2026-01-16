import { Acclimate } from "../src/Acclimate";

const DevDBCLI = Acclimate.createCLI("db").description("Database tools");
const DevWebCLI = Acclimate.createCLI("web").description("Web tools");

const DevCLI = Acclimate.createCLI("dev")
  .description("Run the dev workflow")
  .addPositionalArg({
    name: "target",
    type: "string",
    required: false,
    description: "Target to run",
    askIfEmpty: {
      message: "What target should I run?",
    },
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
  .addOption({
    name: "--confirm",
    aliases: ["-c"],
    type: "boolean",
    required: false,
    description: "Confirm before running",
    askIfEmpty: {
      message: "Continue with execution?",
    },
  })
  .addOption({
    name: "--region",
    aliases: ["-r"],
    type: "string",
    required: false,
    description: "Deployment region",
    askIfEmpty: {
      message: "Which region should I use?",
    },
  })
  .addGlobalOption({
    name: "--env",
    aliases: ["-e"],
    type: "string",
    required: false,
    defaultValue: "dev",
    description: "Environment",
  })
  .addGlobalOption({
    name: "--profile",
    aliases: ["-p"],
    type: "string",
    required: false,
    description: "Credentials profile",
    askIfEmpty: {
      message: "Which profile should I use?",
    },
  })
  .addCommand("db", DevDBCLI)
  .addCommand("web", DevWebCLI)
  .action(
    ({ target, count, mode, verbose, dryRun, env, region, profile, confirm }) => {
      const cycles = Math.max(1, count ?? 1);

      Acclimate.log("|cyan|Running program...|reset|");
      Acclimate.log(
        "|gray|Target: $target$ · Env: $env$ · Mode: $mode$ · Region: $region$ · Profile: $profile$ · Confirm: $confirm$|reset|",
        {
          target,
          env,
          mode,
          region,
          profile,
          confirm: confirm === undefined ? "unset" : String(confirm),
        }
      );
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
    }
  );

const cli = Acclimate.createCLI("demo-cli")
  .description("This is a demo CLI")
  .addCommand("dev", DevCLI);

Acclimate.run(cli);
