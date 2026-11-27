import { describe, expect, it, vi } from "vitest";
import { createCli } from "@/AcclimateCli/createCli/createCli";
import { runCli } from "@/AcclimateCli/runCli/runCli";
import type { ActionArgs } from "./runCli.testHelpers";

describe("runCli - commands", () => {
  it("runs a subcommand with no arguments", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const devCommandAction = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("root")
      .addCommand("dev", createCli("dev").action(devCommandAction))
      .action(rootAction);

    await runCli({ cli, input: ["dev"] });

    expect(devCommandAction).toHaveBeenCalled();
  });

  it("runs a subcommand action instead of the root action", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const commandAction = vi.fn<(args: ActionArgs) => void>();

    const initCli = createCli("init").action(commandAction);

    const cli = createCli("root")
      .addCommand("init", initCli)
      .action(rootAction);

    await runCli({ cli, input: ["init"] });

    expect(commandAction).toHaveBeenCalled();
    expect(rootAction).not.toHaveBeenCalled();
  });

  it("throws when an unrecognized command token is passed to a CLI with no positional args", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();

    const cli = createCli("root").action(rootAction);

    await expect(runCli({ cli, input: ["missingCommand"] })).rejects.toThrow();

    expect(rootAction).not.toHaveBeenCalled();
  });

  it("applies defaultValue to omitted optional subcommand positional args", async () => {
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCli = createCli("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .addPositionalArg({
        name: "region",
        type: "string",
        required: false,
        defaultValue: "us-east-1",
      })
      .action(deployAction);

    const cli = createCli("root").addCommand("deploy", deployCli);

    await runCli({ cli, input: ["deploy", "api"] });

    expect(deployAction).toHaveBeenCalledWith({
      service: "api",
      region: "us-east-1",
    });
  });

  it("passes required and optional subcommand options using mixed aliases and long names", async () => {
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCli = createCli("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .addOption({
        name: "--replicas",
        aliases: ["-r"],
        type: "number",
        required: true,
      })
      .addOption({
        name: "--note",
        aliases: ["-n"],
        type: "string",
        required: false,
        defaultValue: "no note",
      })
      .addOption({
        name: "--dry-run",
        aliases: ["-d"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .action(deployAction);

    const cli = createCli("root").addCommand("deploy", deployCli);

    await runCli({
      cli,
      input: [
        "deploy",
        "api",
        "-r",
        "3",
        "--note",
        "this is one token with spaces",
        "-d",
      ],
    });

    expect(deployAction).toHaveBeenCalledWith({
      service: "api",
      replicas: 3,
      note: "this is one token with spaces",
      dryRun: true,
    });
  });

  it("propagates root global options into matched subcommands", async () => {
    const rootAction = vi.fn<(args: ActionArgs) => void>();
    const deployAction = vi.fn<(args: ActionArgs) => void>();

    const deployCli = createCli("deploy")
      .addPositionalArg({
        name: "service",
        type: "string",
        required: true,
      })
      .action(deployAction);

    const cli = createCli("root")
      .addGlobalOption({
        name: "--token",
        aliases: ["-t"],
        type: "string",
        required: true,
      })
      .addGlobalOption({
        name: "--verbose",
        aliases: ["-v"],
        type: "boolean",
        required: false,
        defaultValue: false,
      })
      .addCommand("deploy", deployCli)
      .action(rootAction);

    await runCli({
      cli,
      input: ["deploy", "api", "--verbose", "-t", "abc 123"],
    });

    expect(deployAction).toHaveBeenCalledWith({
      token: "abc 123",
      verbose: true,
      service: "api",
    });

    expect(rootAction).not.toHaveBeenCalled();
  });

  it("delivers required positional args and optional flags to deeply nested subcommands", async () => {
    const newModelAction = vi.fn<(args: ActionArgs) => void>();

    const newModelCli = createCli("new")
      .addPositionalArg({
        name: "modelName",
        description: "PascalCased model name (e.g. QueryColumn).",
        type: "string",
        required: true,
      })
      .addOption({
        name: "--path",
        aliases: ["-p"],
        description:
          "Output path where the `<ModelName>/` sub-directory will be placed",
        type: "string",
        required: false,
      })
      .action(newModelAction);
    const modelsCli = createCli("new").addCommand("new", newModelCli);
    const devCli = createCli("dev").addCommand("models", modelsCli);
    const rootCli = createCli("root").addCommand("dev", devCli);

    await runCli({
      cli: rootCli,
      input: ["dev", "models", "new", "Dashboard"],
    });

    expect(newModelAction).toHaveBeenCalledWith({
      modelName: "Dashboard",
      path: undefined,
    });
  });
});
