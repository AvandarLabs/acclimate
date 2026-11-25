import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createGithubRelease } from "./createGithubRelease";
import { isVersionPublished } from "./npmRegistry";
import type { GitRunner } from "./releaseCommits";

const execFileAsync = promisify(execFile);

function _createRunner(command: string): GitRunner {
  return async (args) => {
    const { stdout } = await execFileAsync(command, [...args]);
    return stdout;
  };
}

/**
 * Entry point for the release workflow: after the Changesets action has run,
 * tags and releases the current version if it is on npm and not yet released.
 * `gh` reads its token from `GH_TOKEN` in the environment.
 */
async function main(): Promise<void> {
  await createGithubRelease({
    readPackageJson: async () => {
      const text = await readFile("package.json", "utf8");
      return JSON.parse(text) as { name: string; version: string };
    },
    readChangelog: () => {
      return readFile("CHANGELOG.md", "utf8").catch(() => {
        return "";
      });
    },
    isPublished: (params) => {
      return isVersionPublished({ ...params, fetchFn: fetch });
    },
    runGit: _createRunner("git"),
    runGh: _createRunner("gh"),
    log: (message) => {
      console.log(`[create-github-release] ${message}`);
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
