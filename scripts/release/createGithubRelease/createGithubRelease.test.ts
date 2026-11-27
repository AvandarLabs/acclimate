import { describe, expect, it, vi } from "vitest";
import { createGithubRelease } from "./createGithubRelease";
import type { CreateGithubReleaseDeps } from "./createGithubRelease";

const CHANGELOG = "# pkg\n\n## 0.5.0\n\n### Minor Changes\n\n- Adds x.\n";

function _deps(
  overrides: Partial<CreateGithubReleaseDeps> = {},
): CreateGithubReleaseDeps {
  return {
    readPackageJson: () => {
      return Promise.resolve({ name: "@avandar/acclimate", version: "0.5.0" });
    },
    readChangelog: () => {
      return Promise.resolve(CHANGELOG);
    },
    isPublished: () => {
      return Promise.resolve(true);
    },
    runGit: () => {
      return Promise.resolve("abc123def456\n");
    },
    runGh: vi.fn((args: readonly string[]) => {
      return args[0] === "release" && args[1] === "view"
        ? Promise.reject(new Error("release not found"))
        : Promise.resolve("");
    }),
    log: () => {},
    ...overrides,
  };
}

describe("createGithubRelease", () => {
  it("creates the tag and release with the changelog as notes", async () => {
    const deps = _deps();
    const result = await createGithubRelease(deps);
    expect(result).toEqual({ kind: "created", tag: "v0.5.0" });
    expect(deps.runGh).toHaveBeenCalledWith([
      "release",
      "create",
      "v0.5.0",
      "--target",
      "abc123def456",
      "--title",
      "v0.5.0",
      "--notes",
      "### Minor Changes\n\n- Adds x.",
    ]);
  });

  it("skips when the release already exists", async () => {
    const deps = _deps({
      runGh: vi.fn().mockResolvedValue("exists"),
    });
    expect(await createGithubRelease(deps)).toEqual({
      kind: "already-exists",
      tag: "v0.5.0",
    });
  });

  it("skips while the version is not on npm", async () => {
    const result = await createGithubRelease(
      _deps({
        isPublished: () => {
          return Promise.resolve(false);
        },
      }),
    );
    expect(result).toEqual({ kind: "not-published", tag: "v0.5.0" });
  });

  it("falls back to generated notes when the changelog has no section", async () => {
    const deps = _deps({
      readChangelog: () => {
        return Promise.resolve("# pkg\n");
      },
    });
    await createGithubRelease(deps);
    expect(deps.runGh).toHaveBeenCalledWith(
      expect.arrayContaining(["--generate-notes"]),
    );
  });

  it("targets HEAD when no commit introduced the version", async () => {
    const deps = _deps({
      runGit: () => {
        return Promise.resolve("");
      },
    });
    await createGithubRelease(deps);
    expect(deps.runGh).toHaveBeenCalledWith(
      expect.arrayContaining(["--target", "HEAD"]),
    );
  });
});
