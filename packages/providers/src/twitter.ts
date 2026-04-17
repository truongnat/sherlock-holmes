import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";
import { ChainedProvider, ProviderStrategy } from "../../sdk/src/provider-base.ts";

export class TwitterHeadlessStrategy extends ProviderStrategy {
  readonly name = "headless";

  isAvailable(ctx: ScanContext): boolean {
    return !!ctx.browser;
  }

  async execute(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type !== "username" || !ctx.browser) return [];

    const page = await ctx.browser.newPage();
    try {
      const url = `https://x.com/${query.value}`;
      ctx.logger.debug(`Navigating to ${url}`);

      await page.goto(url);

      // Wait for some indicators of profile or 404
      const content = await page.content();

      // Basic check for Twitter's "This account doesn't exist" or profile elements
      if (content.includes("account doesn't exist")) {
        return [];
      }

      // If we see the user handle in the page title or content, it's a good sign
      const title = await page.evaluate(() => document.title);
      if (title.toLowerCase().includes(query.value.toLowerCase())) {
        return [
          {
            url,
            username: query.value,
            confidence: 0,
            evidence: ["browser_match"],
          },
        ];
      }
    } catch (err) {
      ctx.logger.error("Twitter headless scan failed", err);
    } finally {
      await page.close();
    }

    return [];
  }
}

export class TwitterProvider extends ChainedProvider {
  readonly manifest: ProviderManifest = {
    id: "twitter",
    name: "X (Twitter)",
    version: "0.0.1",
    author: "Holmes Team",
    supports: ["username"],
    requiresAuth: false,
    requiresBrowser: false, // Make false by default, strategy will check ctx.browser
  };

  readonly strategies = [new TwitterHeadlessStrategy()];
}
