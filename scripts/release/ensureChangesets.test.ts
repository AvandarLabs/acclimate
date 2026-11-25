import { describe, expect, it, vi } from "vitest";
import { ensureChangesets } from "./ensureChangesets";
import type { EnsureChangesetsDeps } from "./ensureChangesets";

const LOG_LINE = "aaaaaaaaaa\tMerge jpsyx/feat/thing\n";

function _deps(
  overrides: Partial<EnsureChangesetsDeps> = {},
): EnsureChangesetsDeps {
  const written = new Map<string, string>();
  const runGit = vi.fn((args: readonly string[]) => {
    const command = args.join(" ");
    if (command.startsWith("describe")) {
      return Promise.resolve("v0.4.0\n");
    }
    if (command.startsWith("log")) {
      return Promise.resolve(LOG_LINE);
    }
    if (command.includes("--name-only")) {
      return Promise.resolve("src/index.ts\n");
    }
    return Promise.resolve("diff --git a b");
  });
  return {
    runGit,
    fetchFn: vi.fn((url: string) => {
      return Promise.resolve(
        url.includes("registry.npmjs.org") ?
          new Response("{}", { status: 200 })
        : new Response(
            JSON.stringify({
              content: [
                {
                  type: "text",
                  text: '{"notes":[{"text":"Adds thing.","commits":["aaaaaaa"],"bump":"minor"}]}',
                },
              ],
            }),
            { status: 200 },
          ),
      );
    }) as unknown as typeof fetch,
    apiKey: "key",
    readPackageJson: () => {
      return Promise.resolve({ name: "@avandar/acclimate", version: "0.4.0" });
    },
    listChangesetFiles: () => {
      return Promise.resolve(["README.md", "config.json"]);
    },
    writeChangesetFile: (name, content) => {
      written.set(name, content);
      return Promise.resolve();
    },
    log: () => {},
    ...overrides,
    // exposed for assertions
    ...({ written } as object),
  };
}

describe("ensureChangesets", () => {
  it("skips when a manual changeset already exists", async () => {
    const result = await ensureChangesets(
      _deps({
        listChangesetFiles: () => {
          return Promise.resolve(["README.md", "manual.md"]);
        },
      }),
    );
    expect(result.kind).toBe("skipped-manual");
  });

  it("skips while the current version is not yet published", async () => {
    const result = await ensureChangesets(
      _deps({
        fetchFn: (() => {
          return Promise.resolve(new Response("", { status: 404 }));
        }) as unknown as typeof fetch,
      }),
    );
    expect(result.kind).toBe("skipped-unpublished");
  });

  it("writes one changeset per resolved note", async () => {
    const deps = _deps();
    const result = await ensureChangesets(deps);
    expect(result.kind).toBe("written");
    const written = (deps as unknown as { written: Map<string, string> })
      .written;
    const [content] = [...written.values()];
    expect(content).toContain('"@avandar/acclimate": minor');
    expect(content).toContain("Adds thing.");
  });

  it("falls back to commit subjects when the model call fails", async () => {
    const deps = _deps({
      fetchFn: ((url: string) => {
        return Promise.resolve(
          url.includes("registry.npmjs.org") ?
            new Response("{}", { status: 200 })
          : new Response("boom", { status: 500 }),
        );
      }) as unknown as typeof fetch,
    });
    const result = await ensureChangesets(deps);
    expect(result.kind).toBe("written");
  });

  it("reports nothing to release when no commit qualifies", async () => {
    const result = await ensureChangesets(
      _deps({
        runGit: () => {
          return Promise.resolve("");
        },
      }),
    );
    expect(result.kind).toBe("nothing-to-release");
  });
});
