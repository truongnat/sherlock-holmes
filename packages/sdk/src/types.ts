/**
 * ============================================================================
 * Holmes Core Types
 * ============================================================================
 *
 * Đây là file QUAN TRỌNG NHẤT của hệ thống. Mọi provider, plugin, và CLI đều
 * phụ thuộc vào các type khai báo ở đây. Khi thay đổi cần cẩn thận vì sẽ break
 * tất cả contributor plugins.
 *
 * Nguyên tắc thiết kế:
 *  1. Provider không được biết về internal của core (engine, scoring, cache)
 *  2. Mọi I/O đi qua ScanContext để dễ test (inject mock)
 *  3. Type phải narrow nhất có thể để TS catch lỗi sớm
 * ============================================================================
 */

// ─── Step 1: Định nghĩa các loại query mà hệ thống chấp nhận ─────────────────
// Mỗi provider sẽ declare nó support query type nào trong manifest.
// Engine dùng info này để chỉ gọi provider phù hợp với input của user.
export type QueryType =
  | "username" // VD: "truongnat", "torvalds"
  | "email" // VD: "user@example.com"
  | "phone" // VD: "+84901234567" (E.164 format)
  | "fullname" // VD: "Dao Quang Truong" (có thể có dấu)
  | "url"; // VD: "https://github.com/torvalds" (reverse lookup)

// ─── Step 2: Query object — input chuẩn hoá đi vào provider ──────────────────
// CLI sẽ parse user input và build object này. Provider chỉ work với object,
// không bao giờ touch raw input từ user → tránh injection.
export interface Query {
  /** Loại query, dùng để route tới provider phù hợp */
  readonly type: QueryType;

  /** Giá trị đã được normalize (trim, lowercase nếu cần, NFC unicode) */
  readonly value: string;

  /** Giá trị gốc user nhập, giữ lại để hiển thị/debug */
  readonly rawValue: string;

  /** Hints optional giúp provider scope kết quả tốt hơn */
  readonly hints?: {
    readonly country?: string; // ISO 3166-1 alpha-2, VD: "VN"
    readonly locale?: string; // BCP 47, VD: "vi-VN"
  };
}

// ─── Step 3: Manifest — provider tự khai báo capability ──────────────────────
// Engine đọc manifest TRƯỚC khi gọi scan() để biết provider này có dùng được
// cho query hiện tại không, có cần browser không, rate limit thế nào.
export interface ProviderManifest {
  /** ID duy nhất, lowercase, kebab-case. VD: "facebook", "github" */
  readonly id: string;

  /** Tên hiển thị cho user */
  readonly name: string;

  /** SemVer, dùng để check tương thích với core */
  readonly version: string;

  /** Tác giả, hiển thị trong `holmes providers info <id>` */
  readonly author: string;

  /** Provider này nhận query type nào. Engine filter dựa vào đây */
  readonly supports: readonly QueryType[];

  /** True nếu cần API key/cookie. Engine sẽ cảnh báo nếu chưa config */
  readonly requiresAuth: boolean;

  /** True nếu cần Playwright. Engine inject browser context khi gọi scan() */
  readonly requiresBrowser: boolean;

  /** Rate limit khuyến nghị, engine tự throttle */
  readonly rateLimit?: {
    readonly requestsPerMinute: number;
  };

  /**
   * Phase 2: Permissions plugin cần (security model).
   * Built-in providers có thể bỏ trống, plugin bắt buộc khai báo.
   */
  readonly permissions?: readonly ("network" | "filesystem" | "browser")[];
}

// ─── Step 4: Match — đại diện 1 kết quả tìm thấy ─────────────────────────────
// Mọi provider phải convert kết quả raw của họ về shape này. Đây là contract
// để renderer (table, json, html) work uniformly với mọi nguồn data.
export interface Match {
  /** URL tới profile/page tìm thấy. Optional vì có provider chỉ trả meta */
  readonly url?: string;

  /** Tên hiển thị (VD: "Đào Quang Trưởng") */
  readonly displayName?: string;

  /** Username/handle trên platform đó */
  readonly username?: string;

  /** URL ảnh đại diện */
  readonly avatar?: string;

  /** Bio/description ngắn */
  readonly bio?: string;

  /** Vị trí nếu có (VD: "Hanoi, Vietnam") */
  readonly location?: string;

  /**
   * Unique hash of the avatar image to find duplicates across platforms.
   */
  readonly avatarHash?: string;

  /**
   * Links found in bio or profiles (personal sites, other social links).
   */
  readonly links?: readonly string[];

  /**
   * The platform-specific unique ID (e.g. numeric ID in Facebook).
   */
  readonly platformId?: string;

  /**
   * Custom metadata.
   */
  readonly extra?: Readonly<Record<string, unknown>>;

  /**
   * Confidence score 0-1, do scoring engine tính (KHÔNG phải provider).
   * Provider chỉ trả raw match, engine assign score.
   * - 1.0 = exact match (username trùng 100%)
   * - 0.0 = không match gì (sẽ bị filter ra)
   */
  readonly confidence: number;

  /**
   * Lý do match — UX quan trọng. User cần biết VÌ SAO 1 result được trả về.
   * VD: ["exact_username", "name_similarity:0.87", "location_match"]
   */
  readonly evidence: readonly string[];
}

// ─── Step 5: Lỗi từ provider — không throw, return về để engine handle ───────
// Provider KHÔNG được throw raw error. Phải catch và return ProviderError để
// engine có thể aggregate và hiển thị unified error report cho user.
export interface ProviderError {
  /** Mã lỗi machine-readable, dùng cho i18n và error handling */
  readonly code:
    | "rate_limited"
    | "auth_required"
    | "auth_failed"
    | "network_error"
    | "parse_error"
    | "not_supported"
    | "unknown";

  /** Message human-readable, có thể i18n sau */
  readonly message: string;

  /** Strategy/method nào fail (cho fallback chain) */
  readonly strategy?: string;

  /** Có nên retry không (engine quyết định dựa vào đây) */
  readonly retryable: boolean;
}

// ─── Step 6: ScanResult — output cuối cùng từ 1 lần scan của 1 provider ─────
export interface ScanResult {
  /** ID của provider đã scan */
  readonly providerId: string;

  /** Query gốc, để renderer biết context */
  readonly query: Query;

  /** Danh sách matches tìm được, đã sort theo confidence DESC */
  readonly matches: readonly Match[];

  /** Lỗi xảy ra (có thể partial — vài strategy fail nhưng vẫn có result) */
  readonly errors: readonly ProviderError[];

  /** Metadata cho debug & UX */
  readonly metadata: {
    readonly durationMs: number;
    readonly source: "api" | "scrape" | "browser" | "cache";
    readonly strategiesUsed: readonly string[];
  };
}

// ─── Step 7: ScanContext — toolbox engine inject vào provider ────────────────
// Provider KHÔNG được tự tạo HTTP client, cache, logger. Phải dùng từ context.
// Lý do: engine kiểm soát rate limit, retry, abort signal tập trung.
export interface ScanContext {
  /** HTTP client đã config sẵn retry, UA rotation, proxy */
  readonly http: HttpClient;

  /** Browser context, CHỈ inject khi manifest.requiresBrowser=true */
  readonly browser?: BrowserContext;

  /** Cache adapter, provider có thể cache intermediate results */
  readonly cache: CacheAdapter;

  /** Logger có scope theo providerId */
  readonly logger: Logger;

  /** Abort signal — provider PHẢI check signal.aborted trong long loops */
  readonly signal: AbortSignal;

  /** Config user-provided cho provider này (validated qua zod) */
  readonly config: Readonly<Record<string, unknown>>;
}

// ─── Step 8: Forward declarations — chi tiết ở các file khác ─────────────────
// Tách ra để file types này không phình to. Các interface này được implement
// trong packages/sdk (HttpClient) và packages/core (Cache, Logger).
export interface HttpClient {
  get(url: string, options?: HttpOptions): Promise<HttpResponse>;
  post(url: string, body: unknown, options?: HttpOptions): Promise<HttpResponse>;
}

export interface HttpOptions {
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
  readonly retries?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly json: <T = unknown>() => T;
}

export interface BrowserContext {
  readonly newPage: () => Promise<Page>;
  readonly close: () => Promise<void>;
}

export interface Page {
  readonly goto: (url: string) => Promise<void>;
  readonly content: () => Promise<string>;
  readonly close: () => Promise<void>;
  readonly evaluate: <T>(fn: string | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
  readonly screenshot?: (options?: { path?: string }) => Promise<Buffer>;
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}
