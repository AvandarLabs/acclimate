import { Acclimate } from "../src/Acclimate";

const SubCommandCLI = Acclimate.createCLI("dev").action(() => {
  Acclimate.log("|cyan|Running $command$...|reset|", { command: "dev" });
  Acclimate.log("Finished running command.");
});

const cli = Acclimate.createCLI("demo-cli")
  .addCommand("dev", SubCommandCLI)
  .action(() => {
    Acclimate.log("|green|Hello, $name$!|reset|", { name: "world" });
  });

Acclimate.run(cli);
