import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";
import { Provider } from "../../sdk/src/provider-base.ts";

export class RedditProvider extends Provider {
  readonly manifest: ProviderManifest = {
    id: "reddit",
    name: "Reddit",
    version: "0.0.1",
    author: "Holmes Team",
    supports: ["username"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  async scan(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type !== "username") return [];

    try {
      const url = `https://www.reddit.com/user/${encodeURIComponent(query.value)}/about.json`;
      const res = await ctx.http.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SherlockHolmes/1.0",
        },
      });

      if (res.status === 404 || res.status === 403) {
        return [];
      }

      const data = res.json<{
        data?: {
          name: string;
          display_name_prefixed: string;
          icon_img: string;
          total_karma: number;
          created_utc: number;
        };
      }>();

      if (!data.data) return [];

      return [
        {
          url: `https://www.reddit.com/user/${data.data.name}`,
          displayName: data.data.display_name_prefixed,
          username: data.data.name,
          avatar: data.data.icon_img?.split("?")[0],
          extra: {
            karma: data.data.total_karma,
            created_utc: data.data.created_utc,
          },
          confidence: 0,
          evidence: [],
        },
      ];
    } catch (err) {
      ctx.logger.error("Failed to scan Reddit", err);
      return [];
    }
  }
}
