import type {
  Match,
  Provider,
  Query,
  ScanContext,
  ScanResult,
  BrowserContext,
} from "../../sdk/src/types.ts";
import { scoreMatch } from "../../sdk/src/scoring.ts";
import { MemoryCacheAdapter } from "./cache.ts";
import { ConsoleLogger, FetchHttpClient, PlaywrightBrowserContext } from "./infrastructure.ts";

export interface EngineOptions {
  readonly providers: Provider[];
  readonly config?: Record<string, Record<string, unknown>>;
}

export class Engine {
  private readonly providers: Provider[];
  private readonly globalConfig: Record<string, Record<string, unknown>>;
  private readonly httpClient = new FetchHttpClient();
  private readonly cache = new MemoryCacheAdapter();
  private browser: BrowserContext | null = null;

  constructor(options: EngineOptions) {
    this.providers = options.providers;
    this.globalConfig = options.config ?? {};
  }

  async scan(
    query: Query,
    options?: {
      signal?: AbortSignal;
      onResult?: (result: ScanResult) => void;
    },
  ): Promise<ScanResult[]> {
    const signal = options?.signal ?? new AbortController().signal;

    // 1. Filter providers that support this query
    const activeProviders = this.providers.filter((p) => p.supportsQuery(query));

    // 2. Only launch browser if at least one active provider REQUIRES it
    const needsBrowser = activeProviders.some((p) => p.manifest.requiresBrowser);

    if (needsBrowser && !this.browser) {
      this.browser = await PlaywrightBrowserContext.create();
    }

    // Run scans in parallel
    const scanPromises = activeProviders.map(async (p) => {
      const res = await this.scanWithProvider(p, query, signal);
      if (options?.onResult) {
        options.onResult(res);
      }
      return res;
    });

    const results = await Promise.all(scanPromises);

    // Auto-close browser if it was opened
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    return results;
  }

  private async scanWithProvider(
    provider: Provider,
    query: Query,
    signal: AbortSignal,
  ): Promise<ScanResult> {
    const providerId = provider.manifest.id;
    const startTime = Date.now();
    const logger = new ConsoleLogger(providerId);

    const ctx: ScanContext = {
      http: this.httpClient,
      cache: this.cache,
      logger,
      signal,
      config: this.globalConfig[providerId] ?? {},
      browser: provider.manifest.requiresBrowser ? this.browser || undefined : undefined,
    };

    try {
      // 1. Run the scan
      const rawMatches = await provider.scan(query, ctx);

      // 2. Score matches using the SDK scoring engine
      const scoredMatches = rawMatches
        .map((m) => scoreMatch(query, m))
        .filter((m) => m.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence);

      return {
        providerId,
        query,
        matches: scoredMatches,
        errors: [],
        metadata: {
          durationMs: Date.now() - startTime,
          source: "api", // Simplification for now
          strategiesUsed: [],
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Scan failed: ${errorMsg}`);

      return {
        providerId,
        query,
        matches: [],
        errors: [
          {
            code: "unknown",
            message: errorMsg,
            retryable: false,
          },
        ],
        metadata: {
          durationMs: Date.now() - startTime,
          source: "api",
          strategiesUsed: [],
        },
      };
    }
  }
}
