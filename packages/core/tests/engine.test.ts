import { describe, expect, test } from "bun:test";
import { Engine } from "../src/engine.ts";
import { Provider } from "../../sdk/src/provider-base.ts";
import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";

class TestProvider extends Provider {
  readonly manifest: ProviderManifest = {
    id: "test",
    name: "Test",
    version: "1.0.0",
    author: "Test",
    supports: ["username"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  async scan(query: Query, _ctx: ScanContext): Promise<Match[]> {
    return [
      {
        username: query.value,
        confidence: 0,
        evidence: [],
      },
    ];
  }
}

describe("Engine", () => {
  test("should orchestrate scan and score results", async () => {
    const provider = new TestProvider();
    const engine = new Engine({ providers: [provider] });

    const results = await engine.scan({
      type: "username",
      value: "alice",
      rawValue: "Alice",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.providerId).toBe("test");
    expect(results[0]?.matches).toHaveLength(1);
    expect(results[0]?.matches[0]?.confidence).toBeGreaterThan(0);
    expect(results[0]?.matches[0]?.evidence).toContain("exact_username");
  });

  test("should skip providers that do not support the query type", async () => {
    const provider = new TestProvider();
    const engine = new Engine({ providers: [provider] });

    const results = await engine.scan({
      type: "email",
      value: "test@example.com",
      rawValue: "test@example.com",
    });

    expect(results).toHaveLength(0);
  });
});
