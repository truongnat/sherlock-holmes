import { cac } from "cac";
import pc from "picocolors";
import * as dotenv from "dotenv";
import { stringify } from "csv-stringify/sync";
import { Engine } from "../../core/src/engine.ts";
import { CorrelationEngine } from "../../core/src/correlation.ts";
import { loadPlugin, loadPluginsFromDir } from "../../core/src/plugin-loader.ts";
import { GitHubProvider } from "../../providers/src/github.ts";
import { FacebookProvider } from "../../providers/src/facebook.ts";
import { RedditProvider } from "../../providers/src/reddit.ts";
import { InstagramProvider } from "../../providers/src/instagram.ts";
import { TwitterProvider } from "../../providers/src/twitter.ts";
import { GoogleSearchProvider } from "../../providers/src/google.ts";
import { GravatarProvider } from "../../providers/src/gravatar.ts";
import { PhoneLookupProvider } from "../../providers/src/phone.ts";
import { detectQueryType } from "../../sdk/src/detector.ts";
import type { QueryType } from "../../sdk/src/types.ts";

dotenv.config();

const cli = cac("holmes");

cli
  .command("scan <value>", "Scan for an identity")
  .option("-t, --type <type>", "Query type (auto, username, email, phone, fullname, url)", { default: "auto" })
  .option("--json", "Output results in JSON format")
  .option("--csv", "Output results in CSV format")
  .option("--browser", "Enable browser-based scanning (requires Playwright)")
  .option("--analyze", "Correlate results into identity profiles")
  .option("-p, --plugin <path>", "Load a custom provider plugin (file or directory)")
  .action(
    async (
      value: string,
      options: {
        type: string;
        json?: boolean;
        csv?: boolean;
        browser?: boolean;
        analyze?: boolean;
        plugin?: string;
      },
    ) => {
      // 1. Detect query type if set to auto
      const queryType = options.type === "auto" ? detectQueryType(value) : (options.type as QueryType);

      const isQuiet = options.json || options.csv;
      if (!isQuiet) {
        console.log(pc.cyan(`\n🕵️  Searching for ${pc.bold(value)} (${pc.yellow(queryType)})...
`));
      }

      const providers = [
        new GitHubProvider(),
        new FacebookProvider(),
        new RedditProvider(),
        new InstagramProvider(),
        new TwitterProvider(),
        new GoogleSearchProvider(),
        new GravatarProvider(),
        new PhoneLookupProvider(),
      ];

      // If user wants browser, we modify the manifest of providers that can use it
      if (options.browser) {
        for (const p of providers) {
          if (p.manifest.id === "twitter") {
            // Force it to true so engine knows to start browser
            (p.manifest as any).requiresBrowser = true;
          }
        }
      }

      // Load dynamic plugins if provided
      if (options.plugin) {
        try {
          const stats = await import("node:fs/promises").then((fs) => fs.stat(options.plugin!));
          if (stats.isDirectory()) {
            const plugins = await loadPluginsFromDir(options.plugin);
            providers.push(...plugins);
          } else {
            const plugin = await loadPlugin(options.plugin);
            providers.push(plugin);
          }
        } catch (err) {
          console.error(pc.red(`Failed to load plugins: ${(err as Error).message}`));
          process.exit(1);
        }
      }

      const engine = new Engine({
        providers,
        config: {
          github: { token: process.env.GITHUB_TOKEN },
        },
      });

      const results = await engine.scan({
        type: queryType,
        value: value.toLowerCase(),
        rawValue: value,
      });

      if (options.analyze && !isQuiet) {
        const profiles = CorrelationEngine.correlate(results);
        console.log(pc.magenta(pc.bold("\n🧠 Identity Analysis Report")));
        console.log(pc.dim("========================================"));
        
        for (const profile of profiles) {
          console.log(`\n👤 ${pc.bold(profile.primaryDisplayName || "Unknown")}`);
          console.log(`   Confidence: ${pc.green((profile.score * 100).toFixed(0) + "%")}`);
          console.log(`   Platforms: ${profile.matches.map(m => (m as any).providerId).join(", ")}`);
          
          const uniqueLinks = [...new Set(profile.matches.flatMap(m => m.links || []))];
          if (uniqueLinks.length > 0) {
            console.log(`   Associated Links:`);
            for (const link of uniqueLinks) console.log(`    🔗 ${pc.dim(link)}`);
          }
        }
        console.log("\n");
      }

      // Handle Output Formats
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (options.csv) {
        const flatResults = results.flatMap((r) =>
          r.matches.map((m) => ({
            provider: r.providerId,
            username: m.username,
            display_name: m.displayName,
            url: m.url,
            confidence: m.confidence,
            evidence: m.evidence.join(";"),
          })),
        );
        console.log(stringify(flatResults, { header: true }));
        return;
      }

      // Default Human-Readable Output
      let foundAny = false;
      for (const result of results) {
        if (result.matches.length === 0) continue;
        foundAny = true;
        console.log(pc.green(`Found on ${pc.bold(result.providerId.toUpperCase())}:`));
        for (const match of result.matches) {
          const confidence = (match.confidence * 100).toFixed(0);
          const color =
            match.confidence > 0.8 ? pc.green : match.confidence > 0.5 ? pc.yellow : pc.red;
          console.log(`  ${pc.bold(match.username || "unknown")} [${color(`${confidence}%`)}]`);
          if (match.url) console.log(`  🔗 ${pc.dim(match.url)}`);
          if (match.displayName) console.log(`  👤 ${match.displayName}`);
          if (match.evidence.length > 0) {
            console.log(`  📝 Evidence: ${pc.dim(match.evidence.join(", "))}`);
          }
          console.log("");
        }
      }

      if (!foundAny) console.log(pc.red("No matches found."));
    },
  );

cli.help();
cli.parse();
