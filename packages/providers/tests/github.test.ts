import { describe, expect, test } from "bun:test";
import { GitHubProvider } from "../src/github.ts";
import type { HttpClient, HttpOptions, HttpResponse, ScanContext } from "../../sdk/src/types.ts";

class MockHttpClient implements HttpClient {
  constructor(private responses: Record<string, Partial<HttpResponse>>) {}

  async get(url: string, _options?: HttpOptions): Promise<HttpResponse> {
    const res = this.responses[url] || { status: 404, body: "{}" };
    return {
      status: res.status ?? 200,
      headers: res.headers ?? {},
      body: res.body ?? "{}",
      json: <T>() => JSON.parse(res.body ?? "{}") as T,
    };
  }

  async post(_url: string, _body: unknown, _options?: HttpOptions): Promise<HttpResponse> {
    throw new Error("Not implemented");
  }
}

describe("GitHubProvider", () => {
  const provider = new GitHubProvider();

  test("should return a match when user exists", async () => {
    const mockHttp = new MockHttpClient({
      "https://api.github.com/users/torvalds": {
        status: 200,
        body: JSON.stringify({
          login: "torvalds",
          name: "Linus Torvalds",
          html_url: "https://github.com/torvalds",
        }),
      },
    });

    const ctx = {
      http: mockHttp,
      logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
      config: {},
    } as unknown as ScanContext;

    const matches = await provider.scan(
      { type: "username", value: "torvalds", rawValue: "torvalds" },
      ctx,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.username).toBe("torvalds");
    expect(matches[0]?.displayName).toBe("Linus Torvalds");
  });

  test("should return empty array when user does not exist", async () => {
    const mockHttp = new MockHttpClient({}); // Default 404

    const ctx = {
      http: mockHttp,
      logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
      config: {},
    } as unknown as ScanContext;

    const matches = await provider.scan(
      { type: "username", value: "nonexistent", rawValue: "nonexistent" },
      ctx,
    );

    expect(matches).toHaveLength(0);
  });
});
