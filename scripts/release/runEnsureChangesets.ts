import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { ensureChangesets } from "./ensureChangesets/ensureChangesets";
import type { GitRunner } from "./releaseCommits/releaseCommits";

const execFileAsync = promisify(execFile);
const CHANGESET_DIRECTORY = ".changeset";
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

const runGit: GitRunner = async (args) => {
  const { stdout } = await execFileAsync("git", [...args], {
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  return stdout;
};

/**
 * Entry point for the release workflow: writes changesets for everything
 * merged since the last release. Reads the API key from `ANTHROPIC_API_KEY`
 * here, at the process boundary, and passes it down.
 */
async function main(): Promise<void> {
  await ensureChangesets({
    runGit,
    fetchFn: fetch,
    apiKey: process.env.ANTHROPIC_API_KEY,
    readPackageJson: async () => {
      const text = await readFile("package.json", "utf8");
      return JSON.parse(text) as { name: string; version: string };
    },
    listChangesetFiles: () => {
      return readdir(CHANGESET_DIRECTORY);
    },
    writeChangesetFile: (fileName, content) => {
      return writeFile(`${CHANGESET_DIRECTORY}/${fileName}`, content);
    },
    log: (message) => {
      console.log(`[ensure-changesets] ${message}`);
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
