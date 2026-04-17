import type { Match, ScanResult } from "../../sdk/src/types.ts";

export interface IdentityProfile {
  id: string;
  primaryUsername?: string;
  primaryDisplayName?: string;
  matches: Match[];
  score: number;
}

export class CorrelationEngine {
  /**
   * Groups individual matches from multiple providers into "Identity Profiles"
   * based on shared signals (links, avatar hashes, location, name).
   */
  static correlate(results: ScanResult[]): IdentityProfile[] {
    const allMatches = results.flatMap((r) => r.matches.map(m => ({ ...m, providerId: r.providerId })));
    const profiles: IdentityProfile[] = [];

    for (const match of allMatches) {
      let foundProfile = false;

      for (const profile of profiles) {
        if (this.shouldLink(profile, match)) {
          profile.matches.push(match);
          this.updateProfileMetadata(profile);
          foundProfile = true;
          break;
        }
      }

      if (!foundProfile) {
        profiles.push({
          id: crypto.randomUUID(),
          primaryUsername: match.username,
          primaryDisplayName: match.displayName,
          matches: [match],
          score: match.confidence,
        });
      }
    }

    return profiles.sort((a, b) => b.score - a.score);
  }

  private static shouldLink(profile: IdentityProfile, match: Match): boolean {
    for (const existing of profile.matches) {
      // Signal 1: Identical usernames (Strong)
      if (match.username && existing.username && match.username.toLowerCase() === existing.username.toLowerCase()) {
        return true;
      }

      // Signal 2: Shared unique links/websites (Very Strong)
      if (match.links && existing.links) {
        const intersection = match.links.filter(l => existing.links?.includes(l));
        if (intersection.length > 0) return true;
      }

      // Signal 3: Identical Avatar Hash (Strong)
      if (match.avatarHash && existing.avatarHash && match.avatarHash === existing.avatarHash) {
        return true;
      }

      // Signal 4: Exact Name + Exact Location (Medium)
      if (match.displayName && existing.displayName && match.location && existing.location) {
        if (match.displayName === existing.displayName && match.location === existing.location) {
          return true;
        }
      }
    }

    return false;
  }

  private static updateProfileMetadata(profile: IdentityProfile) {
    // Recalculate aggregate score and pick best metadata
    profile.score = Math.min(1.0, profile.matches.reduce((acc, m) => acc + m.confidence, 0) / 2);
    
    // Pick the "richest" match for display info
    const bestMatch = [...profile.matches].sort((a, b) => (b.bio?.length || 0) - (a.bio?.length || 0))[0];
    if (bestMatch) {
      profile.primaryDisplayName = bestMatch.displayName || profile.primaryDisplayName;
      profile.primaryUsername = bestMatch.username || profile.primaryUsername;
    }
  }
}
