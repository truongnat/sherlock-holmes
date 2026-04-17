import { Provider } from "../../sdk/src/provider-base.ts";
import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";
import MD5 from "crypto-js/md5";

export class GravatarProvider extends Provider {
  readonly manifest: ProviderManifest = {
    id: "gravatar",
    name: "Gravatar",
    version: "0.0.2",
    author: "Holmes Team",
    supports: ["email"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  async scan(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type !== "email") return [];

    try {
      const email = query.value.trim().toLowerCase();
      const hash = MD5(email).toString();
      
      const url = `https://en.gravatar.com/${hash}.json`;
      ctx.logger.debug(`Gravatar URL: ${url}`);
      const res = await ctx.http.get(url, {
        headers: {
          "User-Agent": "Holmes-OSINT-Engine",
        },
      });

      ctx.logger.debug(`Gravatar Status: ${res.status}`);
      if (res.status === 404) return [];
      if (res.status !== 200) return [];

      const data = res.json<{ entry: any[] }>();
      if (!data.entry || data.entry.length === 0) return [];

      const entry = data.entry[0];
      return [{
        url: entry.profileUrl,
        displayName: entry.displayName || entry.preferredUsername,
        username: entry.preferredUsername,
        avatar: entry.thumbnailUrl,
        bio: entry.aboutMe,
        location: entry.currentLocation,
        confidence: 0.1, // Set small non-zero so Engine can score it
        evidence: ["email_exact_match"],
      }];
    } catch {
      return [];
    }
  }
}
