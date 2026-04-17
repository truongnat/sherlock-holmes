import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";
import { ChainedProvider, ProviderStrategy } from "../../sdk/src/provider-base.ts";

export class FacebookScrapeStrategy extends ProviderStrategy {
  readonly name = "scrape";

  isAvailable(_ctx: ScanContext): boolean {
    return true;
  }

  async execute(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type !== "username") return [];

    // NOTE: This is a VERY simple check. In reality, Facebook has anti-scraping.
    // This is for demonstration of the ChainedProvider pattern.
    const url = `https://www.facebook.com/${query.value}`;
    const res = await ctx.http.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (res.status === 200 && !res.body.includes("Log into Facebook")) {
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

export class FacebookProvider extends ChainedProvider {
  readonly manifest: ProviderManifest = {
    id: "facebook",
    name: "Facebook",
    version: "0.0.1",
    author: "Holmes Team",
    supports: ["username"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  readonly strategies = [new FacebookScrapeStrategy()];
}
