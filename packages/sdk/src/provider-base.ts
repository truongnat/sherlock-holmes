/**
 * ============================================================================
 * Provider Base Class
 * ============================================================================
 *
 * Đây là class mà MỌI provider (built-in lẫn plugin của contributor) phải
 * extend. Cung cấp API tối thiểu nhất nhưng đủ để build provider phức tạp.
 *
 * Cách dùng (từ góc nhìn contributor):
 *
 *   class MyProvider extends Provider {
 *     manifest = { id: 'myservice', ... };
 *
 *     async scan(query, ctx) {
 *       const res = await ctx.http.get(`https://api.x.com/${query.value}`);
 *       return [{ username: query.value, confidence: 1.0, evidence: ['exact'] }];
 *     }
 *   }
 * ============================================================================
 */

import type { Match, ProviderManifest, Query, ScanContext } from "./types.ts";

// ─── Step 1: Abstract base mà mọi provider extend ───────────────────────────
export abstract class Provider {
  /** Khai báo capability — engine đọc trước khi gọi scan() */
  abstract readonly manifest: ProviderManifest;

  /**
   * Step 2: Lifecycle hook - setup
   * Gọi 1 lần khi provider được load. Dùng để:
   *  - Validate config (dùng zod schema từ manifest)
   *  - Khởi tạo connection pool, browser context
   *  - Pre-load data (VD: list 50 sites cho generic provider)
   *
   * Default no-op để provider đơn giản không cần override.
   */
  async setup(_config: Readonly<Record<string, unknown>>): Promise<void> {
    // Default: không làm gì. Override khi cần.
  }

  /**
   * Step 3: Lifecycle hook - teardown
   * Gọi khi engine shutdown. Dùng để cleanup browser, close connections.
   * QUAN TRỌNG: Phải idempotent (gọi nhiều lần không lỗi).
   */
  async teardown(): Promise<void> {
    // Default: không làm gì. Override khi cần.
  }

  /**
   * Step 4: Method chính — engine sẽ gọi cái này khi user scan
   *
   * Contract:
   *  - KHÔNG throw raw error → catch và return ProviderError trong ScanResult
   *    (engine sẽ wrap kết quả của scan() vào ScanResult, provider chỉ trả Match[])
   *  - PHẢI tôn trọng ctx.signal.aborted → return sớm khi user Ctrl+C
   *  - KHÔNG tạo HTTP client riêng → dùng ctx.http
   *  - PHẢI return Match đầy đủ confidence + evidence (dù confidence là 0)
   *  - Không cần sort matches — engine sẽ sort sau
   */
  abstract scan(query: Query, ctx: ScanContext): Promise<Match[]>;

  /**
   * Step 5: Helper — check provider có support query type này không
   * Default đọc từ manifest. Override nếu logic phức tạp hơn (VD: chỉ support
   * email với domain cụ thể).
   */
  supportsQuery(query: Query): boolean {
    return this.manifest.supports.includes(query.type);
  }
}

// ─── Step 6: Strategy pattern cho provider có fallback chain ─────────────────
// Dùng cho providers như Facebook cần thử nhiều cách: API → scrape → headless.
// Contributor có thể tạo strategy mới (VD: cookie-based) mà không sửa core provider.
export abstract class ProviderStrategy {
  /** Tên strategy, hiển thị trong logs và metadata */
  abstract readonly name: string;

  /**
   * Check strategy có dùng được không (VD: có browser, có cookie config).
   * Engine sẽ skip strategy nếu return false → không waste time thử.
   */
  abstract isAvailable(ctx: ScanContext): boolean;

  /**
   * Execute strategy. Throw error nếu fail — provider sẽ catch và thử
   * strategy tiếp theo trong chain.
   */
  abstract execute(query: Query, ctx: ScanContext): Promise<Match[]>;
}

/**
 * Step 7: Helper class cho provider dùng strategy chain
 *
 * Contributor extend class này thay vì Provider thuần khi muốn fallback chain:
 *
 *   class FacebookProvider extends ChainedProvider {
 *     manifest = {...};
 *     strategies = [new APIStrategy(), new ScrapeStrategy(), new HeadlessStrategy()];
 *   }
 */
export abstract class ChainedProvider extends Provider {
  /** Strategy theo thứ tự ưu tiên (cao → thấp) */
  abstract readonly strategies: readonly ProviderStrategy[];

  override async scan(query: Query, ctx: ScanContext): Promise<Match[]> {
    // Step 7.1: Iterate qua từng strategy theo thứ tự
    for (const strategy of this.strategies) {
      // Check abort trước mỗi strategy để cancel nhanh
      if (ctx.signal.aborted) return [];

      // Step 7.2: Skip strategy không khả dụng (thiếu config/browser)
      if (!strategy.isAvailable(ctx)) {
        ctx.logger.debug(`Strategy "${strategy.name}" skipped: not available`);
        continue;
      }

      // Step 7.3: Thử execute, fail thì log và sang strategy tiếp theo
      try {
        ctx.logger.debug(`Trying strategy "${strategy.name}"`);
        const matches = await strategy.execute(query, ctx);

        // Step 7.4: Nếu có kết quả → return luôn, không thử strategy khác
        // (giả định strategy ưu tiên cao = chất lượng cao hơn)
        if (matches.length > 0) {
          ctx.logger.info(`Strategy "${strategy.name}" returned ${matches.length} matches`);
          return matches;
        }
      } catch (err) {
        // Step 7.5: Log warn nhưng KHÔNG throw — để chain tiếp tục
        ctx.logger.warn(`Strategy "${strategy.name}" failed`, { error: err });
      }
    }

    // Step 7.6: Hết strategy mà chưa có kết quả → return empty
    return [];
  }
}
