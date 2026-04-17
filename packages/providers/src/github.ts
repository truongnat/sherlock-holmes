import { Provider } from "../../sdk/src/provider-base.ts";
import type { Match, ProviderManifest, Query, ScanContext } from "../../sdk/src/types.ts";

export class GitHubProvider extends Provider {
  readonly manifest: ProviderManifest = {
    id: "github",
    name: "GitHub",
    version: "0.0.3",
    author: "Holmes Team",
    supports: ["username", "fullname", "email"],
    requiresAuth: false,
    requiresBrowser: false,
  };

  async scan(query: Query, ctx: ScanContext): Promise<Match[]> {
    if (query.type === "username") {
      return this.scanByUsername(query.value, ctx);
    }
    if (query.type === "fullname") {
      return this.scanByFullname(query.value, ctx);
    }
    if (query.type === "email") {
      return this.scanByEmail(query.value, ctx);
    }
    return [];
  }

  private async scanByUsername(username: string, ctx: ScanContext): Promise<Match[]> {
    try {
      const token = ctx.config.token || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        "User-Agent": "Holmes-OSINT-Engine",
      };

      if (token) {
        headers.Authorization = `token ${token}`;
      }

      const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
      const res = await ctx.http.get(url, { headers });

      if (res.status !== 200) return [];

      const data = res.json<any>();
      return [this.mapToMatch(data)];
    } catch {
      return [];
    }
  }

  private async scanByFullname(fullname: string, ctx: ScanContext): Promise<Match[]> {
    try {
      const token = ctx.config.token || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        "User-Agent": "Holmes-OSINT-Engine",
      };

      if (token) {
        headers.Authorization = `token ${token}`;
      }

      // Search users by name
      const url = `https://api.github.com/search/users?q=${encodeURIComponent(fullname)}&per_page=5`;
      const res = await ctx.http.get(url, { headers });

      if (res.status !== 200) return [];

      const data = res.json<{ items: any[] }>();
      const matches: Match[] = [];

      for (const item of data.items) {
        const profileRes = await ctx.http.get(item.url, { headers });
        if (profileRes.status === 200) {
          matches.push(this.mapToMatch(profileRes.json<any>()));
        }
      }

      return matches;
    } catch {
      return [];
    }
  }

  private async scanByEmail(email: string, ctx: ScanContext): Promise<Match[]> {
    try {
      const token = ctx.config.token || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        "User-Agent": "Holmes-OSINT-Engine",
      };

      if (token) {
        headers.Authorization = `token ${token}`;
      }

      // Search users by email
      const url = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`;
      const res = await ctx.http.get(url, { headers });

      if (res.status !== 200) return [];

      const data = res.json<{ items: any[] }>();
      const matches: Match[] = [];

      for (const item of data.items) {
        const profileRes = await ctx.http.get(item.url, { headers });
        if (profileRes.status === 200) {
          matches.push(this.mapToMatch(profileRes.json<any>()));
        }
      }

      return matches;
    } catch {
      return [];
    }
  }

  private mapToMatch(data: any): Match {
    const links: string[] = [];
    if (data.blog) links.push(data.blog);
    if (data.twitter_username) links.push(`https://twitter.com/${data.twitter_username}`);

    return {
      url: data.html_url,
      displayName: data.name ?? undefined,
      username: data.login,
      avatar: data.avatar_url,
      bio: data.bio ?? undefined,
      location: data.location ?? undefined,
      platformId: String(data.id),
      links: links.length > 0 ? links : undefined,
      extra: {
        public_repos: data.public_repos,
        followers: data.followers,
        created_at: data.created_at,
      },
      confidence: 0,
      evidence: [],
    };
  }
}
