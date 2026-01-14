import { Acclimate } from "../src/Acclimate";

const cli = Acclimate.createCLI("demo-cli").action(() => {
  console.log("Hello, world!");
});

Acclimate.run(cli);
