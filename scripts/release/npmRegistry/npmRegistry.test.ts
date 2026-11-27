import { describe, expect, it, vi } from "vitest";
import { isVersionPublished } from "./npmRegistry";

function _fetchReturning(status: number): typeof fetch {
  return vi.fn().mockResolvedValue(new Response("{}", { status }));
}

describe("isVersionPublished", () => {
  it("is true on 200 and asks for the scoped version URL", async () => {
    const fetchFn = _fetchReturning(200);
    const result = await isVersionPublished({
      name: "@avandar/acclimate",
      version: "0.5.0",
      fetchFn,
    });
    expect(result).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@avandar%2Facclimate/0.5.0",
    );
  });

  it("is false on 404", async () => {
    const result = await isVersionPublished({
      name: "x",
      version: "1.0.0",
      fetchFn: _fetchReturning(404),
    });
    expect(result).toBe(false);
  });

  it("throws on any other status", async () => {
    await expect(
      isVersionPublished({
        name: "x",
        version: "1.0.0",
        fetchFn: _fetchReturning(500),
      }),
    ).rejects.toThrow();
  });
});
