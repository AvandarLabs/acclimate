import { Acclimate } from "../src/Acclimate";

const SubCommandCLI = Acclimate.createCLI("dev").action(() => {
  console.log("Running sub-command");
});

const cli = Acclimate.createCLI("demo-cli")
  .addCommand("dev", SubCommandCLI)
  .action(() => {
    console.log("Hello, world!");
  });

Acclimate.run(cli);
