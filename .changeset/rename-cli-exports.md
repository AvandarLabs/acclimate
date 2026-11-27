---
"@avandar/acclimate": minor
---

**Breaking:** public exports now use `Cli` casing instead of `CLI`. Renamed `executeCLI` to `executeCli`, `CLIError` to `CliError`, `CLIErrorCode` to `CliErrorCode`, `AnyCLI` to `AnyCli`, `IAcclimateCLI` to `IAcclimateCli`, `ExecuteCLIOptions` to `ExecuteCliOptions`, `RunCLIOptions` to `RunCliOptions`, and every other `CLI`-prefixed type (`CLICommandName`, `CLIExample`, `CLIFullOptionName`, `CLIOptionAlias`, `CLIOptionParam`, `CLIParamDataType`, `CLIParamScalarValue`, `CLIPositionalParam`, `CLIScalarPositionalParam`, `CLIVariadicPositionalParam`) to the matching `Cli` name. Update imports and type references.
