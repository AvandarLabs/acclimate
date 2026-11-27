import { describe, expect, it, vi } from "vitest";
import {
  buildFallbackNotes,
  parseReleaseNotesResponse,
  requestReleaseNotes,
  makeReleaseNotesFromRawNotes,
} from "./releaseNotes";
import type { ReleaseCandidate } from "../releaseCommits/releaseCommits";

function _candidate(overrides: Partial<ReleaseCandidate>): ReleaseCandidate {
  return {
    sha: "aaaaaaa1111",
    shortSha: "aaaaaaa",
    subject: "Merge jpsyx/feat/thing",
    files: ["src/a.ts"],
    diff: "diff",
    knownBump: "minor",
    ...overrides,
  };
}

describe("parseReleaseNotesResponse", () => {
  it("returns the notes array when the JSON reply is wrapped in a code fence", () => {
    const body =
      '```json\n{"notes":[{"text":"Adds x.","commits":["aaaaaaa"],"bump":"minor"}]}\n```';
    expect(parseReleaseNotesResponse(body)).toEqual([
      { text: "Adds x.", commits: ["aaaaaaa"], bump: "minor" },
    ]);
  });

  it("throws on an invalid shape", () => {
    expect(() => {
      return parseReleaseNotesResponse('{"notes":[{"text":1}]}');
    }).toThrow();
    expect(() => {
      return parseReleaseNotesResponse("not json");
    }).toThrow();
  });
});

describe("makeReleaseNotesFromRawNotes", () => {
  it("uses the deterministic bump when every commit is classified", () => {
    const notes = makeReleaseNotesFromRawNotes({
      rawNotes: [{ text: "t", commits: ["aaaaaaa"], bump: "patch" }],
      candidates: [_candidate({ knownBump: "minor" })],
    });
    expect(notes).toEqual([
      { text: "t", commitShas: ["aaaaaaa"], bump: "minor" },
    ]);
  });

  it("uses the model bump, capped at minor, for unclassified commits", () => {
    const notes = makeReleaseNotesFromRawNotes({
      rawNotes: [{ text: "t", commits: ["bbbbbbb"], bump: "major" }],
      candidates: [_candidate({ shortSha: "bbbbbbb", knownBump: undefined })],
    });
    expect(notes[0]?.bump).toBe("minor");
  });

  it("drops notes that cite no known commit or resolve to none", () => {
    const notes = makeReleaseNotesFromRawNotes({
      rawNotes: [
        { text: "ghost", commits: ["zzzzzzz"], bump: "minor" },
        { text: "skip", commits: ["bbbbbbb"], bump: "none" },
      ],
      candidates: [_candidate({ shortSha: "bbbbbbb", knownBump: undefined })],
    });
    expect(notes).toEqual([]);
  });
});

describe("buildFallbackNotes", () => {
  it("makes one note per commit with a cleaned subject", () => {
    const notes = buildFallbackNotes([
      _candidate({ subject: "feat(cli): add menus (#3)" }),
      _candidate({
        shortSha: "bbbbbbb",
        subject: "Merge jpsyx/fix/exit-codes",
        knownBump: "patch",
      }),
    ]);
    expect(
      notes.map((note) => {
        return note.text;
      }),
    ).toEqual(["Add menus.", "Exit codes."]);
  });
});

describe("requestReleaseNotes", () => {
  it("posts to the Anthropic Messages API and parses the reply", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '{"notes":[{"text":"Adds x.","commits":["aaaaaaa"],"bump":"minor"}]}',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const notes = await requestReleaseNotes({
      apiKey: "key",
      fetchFn,
      candidates: [_candidate({})],
    });
    expect(notes).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key");
  });

  it("throws on a non-2xx response", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      requestReleaseNotes({ apiKey: "k", fetchFn, candidates: [] }),
    ).rejects.toThrow();
  });
});
