import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";
import { ChainedProvider, ProviderStrategy } from "../../sdk/src/provider-base.ts";

export class InstagramScrapeStrategy extends ProviderStrategy {
  readonly name = "scrape";

  isAvailable(_ctx: ScanContext): boolean {
    return true;
  }

  async execute(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type !== "username") return [];

    const url = `https://www.instagram.com/${query.value}/`;
    const res = await ctx.http.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
      },
    });

    // Instagram returns 200 even for some login walls, but often returns 404 for missing users.
    if (res.status === 200 && !res.body.includes("login")) {
      return [
        {
          url,
          username: query.value,
          confidence: 0,
          evidence: [],
        },
      ];
    }

    return [];
  }
}

export class InstagramProvider extends ChainedProvider {
  readonly manifest: ProviderManifest = {
    id: "instagram",
    name: "Instagram",
    version: "0.0.1",
    author: "Holmes Team",
    supports: ["username"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  readonly strategies = [new InstagramScrapeStrategy()];
}
