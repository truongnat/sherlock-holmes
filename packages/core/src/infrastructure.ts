import type {
  BrowserContext,
  HttpClient,
  HttpOptions,
  HttpResponse,
  Logger,
  Page,
} from "../../sdk/src/types.ts";
import { chromium, type BrowserContext as PWContext, type Page as PWPage } from "playwright";

/**
 * Playwright Page Wrapper
 */
export class PlaywrightPage implements Page {
  constructor(private readonly page: PWPage) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "networkidle" });
  }

  async content(): Promise<string> {
    return await this.page.content();
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  async evaluate<T>(fn: string | ((arg: unknown) => T), arg?: unknown): Promise<T> {
    return (await this.page.evaluate(fn, arg)) as T;
  }

  async screenshot(options?: { path?: string }): Promise<Buffer> {
    return (await this.page.screenshot(options)) as Buffer;
  }
}

/**
 * Playwright Browser Wrapper
 */
export class PlaywrightBrowserContext implements BrowserContext {
  constructor(private readonly context: PWContext) {}

  static async create(): Promise<PlaywrightBrowserContext> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    });
    return new PlaywrightBrowserContext(context);
  }

  async newPage(): Promise<Page> {
    const page = await this.context.newPage();
    return new PlaywrightPage(page);
  }

  async close(): Promise<void> {
    const browser = this.context.browser();
    await this.context.close();
    if (browser) await browser.close();
  }
}

export class ConsoleLogger implements Logger {
  constructor(private readonly scope: string) {}

  private format(msg: string): string {
    return `[${this.scope}] ${msg}`;
  }

  debug(msg: string, meta?: unknown): void {
    console.debug(this.format(msg), meta ?? "");
  }

  info(msg: string, meta?: unknown): void {
    console.info(this.format(msg), meta ?? "");
  }

  warn(msg: string, meta?: unknown): void {
    console.warn(this.format(msg), meta ?? "");
  }

  error(msg: string, meta?: unknown): void {
    console.error(this.format(msg), meta ?? "");
  }
}

/**
 * Bun-native Fetch HttpClient
 */
export class FetchHttpClient implements HttpClient {
  async get(url: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.request(url, { method: "GET", ...options });
  }

  async post(url: string, body: unknown, options?: HttpOptions): Promise<HttpResponse> {
    return this.request(url, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  }

  private async request(url: string, init: RequestInit & HttpOptions): Promise<HttpResponse> {
    const response = await fetch(url, {
      ...init,
      // Implement basic timeout if Bun supports it in fetch or use AbortController
      signal: init.timeout ? AbortSignal.timeout(init.timeout) : undefined,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await response.text();

    return {
      status: response.status,
      headers,
      body,
      json: <T>() => JSON.parse(body) as T,
    };
  }
}
