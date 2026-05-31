import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { SearchProvider, SearchResult } from './search.js';

/** ESM-safe `require`, used only to resolve Playwright's synchronous `executablePath()`. */
const nodeRequire = createRequire(import.meta.url);

/**
 * Whole-internet web search, integrated as additional support for the curated
 * {@link KnowledgeBaseSearch}. It mirrors the public API of the
 * [`web-agent-master/google-search`](https://github.com/web-agent-master/google-search)
 * library — `googleSearch(query, options)` returning `{ query, results }` with
 * `{ title, link, snippet }` hits — so that library can be slotted in behind the
 * same {@link WebSearchEngine} interface without touching callers.
 *
 * The library drives Google through Playwright. We do the same when a Chromium
 * binary is available, and otherwise fall back to a JavaScript-free HTTP engine
 * (DuckDuckGo's HTML endpoint), exactly like the news crawler degrades from
 * Playwright to plain `fetch`. The result is a web search that works whether or
 * not a browser is installed, and that returns an empty list — never throws —
 * when the network is unavailable, so the collection pipeline stays resilient.
 */

/** A single web hit. Mirrors `web-agent-master/google-search`'s `SearchResult`. */
export interface WebSearchHit {
  title: string;
  link: string;
  snippet: string;
}

/** The response envelope. Mirrors `web-agent-master/google-search`'s `SearchResponse`. */
export interface WebSearchResponse {
  query: string;
  results: WebSearchHit[];
}

/** Options accepted by {@link googleSearch}. Mirrors the library's `CommandOptions`. */
export interface WebSearchOptions {
  /** Maximum number of hits to return. Defaults to 10. */
  limit?: number;
  /** Per-request timeout in milliseconds. Defaults to 20s. */
  timeoutMs?: number;
  /** Locale hint sent as the `accept-language` header. Defaults to `en-US`. */
  locale?: string;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_LOCALE = 'en-US';

/**
 * A pluggable engine that turns a query into raw web hits. Implementations are
 * injectable so the provider is fully testable with offline doubles.
 */
export interface WebSearchEngine {
  readonly name: string;
  search(query: string, options: Required<WebSearchOptions>): Promise<WebSearchHit[]>;
}

/**
 * Google search backed by Playwright/Chromium — the strategy the
 * `web-agent-master/google-search` library uses. Chromium is imported lazily so
 * environments without the binary can still run every other command.
 */
export class PlaywrightGoogleSearchEngine implements WebSearchEngine {
  readonly name = 'google-playwright';
  // Typed as unknown to avoid a hard compile-time dependency on Playwright's types.
  private browser: unknown = null;

  async search(query: string, options: Required<WebSearchOptions>): Promise<WebSearchHit[]> {
    const browser = await this.ensureBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage();
    try {
      await page.setExtraHTTPHeaders({ 'accept-language': `${options.locale},en;q=0.9` });
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${options.limit}&hl=en`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      const hits = (await page.evaluate(extractGoogleHitsFromPage, options.limit)) as WebSearchHit[];
      return hits.slice(0, options.limit);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (!this.browser) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.browser as any).close();
    this.browser = null;
  }

  private async ensureBrowser(): Promise<unknown> {
    if (this.browser) return this.browser;
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: true });
    return this.browser;
  }
}

/**
 * JavaScript-free fallback engine that queries DuckDuckGo's HTML endpoint with a
 * plain `fetch` and parses the static markup with regular expressions. Activated
 * when Chromium is unavailable, mirroring the news crawler's HTTP fallback, so
 * "Web Search" keeps working without a headless browser.
 */
export class HttpWebSearchEngine implements WebSearchEngine {
  readonly name = 'duckduckgo-http';

  async search(query: string, options: Required<WebSearchOptions>): Promise<WebSearchHit[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: {
          'accept-language': `${options.locale},en;q=0.9`,
          'user-agent': 'TradefastWebSearch/0.1 (+https://github.com/Payel-git-ol/Tradefast)',
        },
      });
      const html = await response.text();
      return parseDuckDuckGoHtml(html, options.limit);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Wraps the Playwright engine and falls back to the HTTP engine when the
 * headless browser cannot be launched (e.g. Chromium was never installed). The
 * first launch failure switches every subsequent query to the HTTP fallback so a
 * single missing browser does not fail every search. Mirrors
 * {@link ResilientNewsPageFetcher}.
 */
export class ResilientWebSearchEngine implements WebSearchEngine {
  readonly name = 'resilient-web-search';
  private readonly fallback = new HttpWebSearchEngine();
  private useFallback = false;

  constructor(private readonly primary: WebSearchEngine = new PlaywrightGoogleSearchEngine()) {}

  async search(query: string, options: Required<WebSearchOptions>): Promise<WebSearchHit[]> {
    if (this.useFallback) return this.fallback.search(query, options);
    try {
      return await this.primary.search(query, options);
    } catch (error) {
      if (isBrowserLaunchError(error)) {
        this.useFallback = true;
        return this.fallback.search(query, options);
      }
      throw error;
    }
  }
}

/**
 * Programmatic entry point mirroring `web-agent-master/google-search`'s
 * `googleSearch(query, options)`. Returns the query alongside its hits.
 */
export async function googleSearch(
  query: string,
  options: WebSearchOptions = {},
  engine: WebSearchEngine = detectWebSearchEngine(),
): Promise<WebSearchResponse> {
  const resolved = resolveOptions(options);
  const results = await engine.search(query, resolved);
  return { query, results: results.slice(0, resolved.limit) };
}

/**
 * Adapts the web search engine to the pipeline's {@link SearchProvider}
 * interface, so whole-internet hits land in the same `search_results` table as
 * the curated knowledge base. Network failures degrade to an empty list rather
 * than aborting a collection run.
 */
export class WebSearchProvider implements SearchProvider {
  readonly name = 'web-search';

  constructor(
    private readonly engine: WebSearchEngine = detectWebSearchEngine(),
    private readonly options: WebSearchOptions = {},
  ) {}

  async search(query: string, symbol?: string): Promise<SearchResult[]> {
    let hits: WebSearchHit[];
    try {
      const { results } = await googleSearch(query, this.options, this.engine);
      hits = results;
    } catch {
      // Whole-internet search is best-effort: a flaky network must never abort a run.
      return [];
    }

    const total = hits.length || 1;
    return hits.map((hit, index) => ({
      query,
      symbol,
      source: this.name,
      title: hit.title,
      url: hit.link || undefined,
      snippet: hit.snippet || undefined,
      // Rank decays with position so the most relevant hit scores highest.
      score: Number(((total - index) / total).toFixed(3)),
    }));
  }
}

/**
 * Chooses the engine the same way the crawler chooses a fetcher: prefer the
 * Playwright/Google strategy when a Chromium binary is actually on disk,
 * otherwise use the HTTP fallback. `executablePath()` only reports where the
 * binary is *expected* to live, so the file must be verified to exist.
 */
export function detectWebSearchEngine(): WebSearchEngine {
  try {
    const playwright = requirePlaywright();
    const executablePath = playwright?.chromium?.executablePath?.();
    if (executablePath && existsSync(executablePath)) {
      return new ResilientWebSearchEngine(new PlaywrightGoogleSearchEngine());
    }
  } catch {
    // Fall through to the HTTP engine.
  }
  return new HttpWebSearchEngine();
}

/** Factory used by the pipeline; isolates engine selection for easy stubbing in tests. */
export function createWebSearchProvider(options: WebSearchOptions = {}): WebSearchProvider {
  return new WebSearchProvider(detectWebSearchEngine(), options);
}

// --- internals --------------------------------------------------------------

function resolveOptions(options: WebSearchOptions): Required<WebSearchOptions> {
  const limit = Number.isFinite(options.limit) && (options.limit as number) > 0
    ? Math.floor(options.limit as number)
    : DEFAULT_LIMIT;
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
    ? Math.floor(options.timeoutMs as number)
    : DEFAULT_TIMEOUT_MS;
  return { limit, timeoutMs, locale: options.locale ?? DEFAULT_LOCALE };
}

/**
 * Synchronously resolves the optional Playwright dependency via `require` when
 * available. Returns `null` when the module (or `require`) is absent, so engine
 * detection degrades cleanly to the HTTP fallback.
 */
function requirePlaywright(): { chromium?: { executablePath?: () => string } } | null {
  try {
    // `executablePath()` is synchronous, so resolving the module via `require` avoids an async import here.
    return nodeRequire('playwright') as { chromium?: { executablePath?: () => string } };
  } catch {
    return null;
  }
}

function isBrowserLaunchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('browserType.launch') ||
    message.includes("Executable doesn't exist") ||
    message.includes('playwright install')
  );
}

/**
 * Parses DuckDuckGo's HTML SERP. Results live in `<a class="result__a">` anchors
 * whose `href` is a `/l/?uddg=<encoded-target>` redirect; snippets follow in
 * `<a class="result__snippet">`. Both classes are extracted independently and
 * zipped by order, which is robust to the surrounding markup changing.
 */
export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  const linkRe = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripHtml(sm[1]));

  let lm: RegExpExecArray | null;
  let index = 0;
  while ((lm = linkRe.exec(html)) !== null && hits.length < limit) {
    const link = decodeDuckDuckGoHref(lm[1]);
    const title = stripHtml(lm[2]);
    if (!link || !title) {
      index++;
      continue;
    }
    if (seen.has(link)) {
      index++;
      continue;
    }
    seen.add(link);
    hits.push({ title, link, snippet: snippets[index] ?? '' });
    index++;
  }

  return hits;
}

/** Resolves DuckDuckGo's `/l/?uddg=` redirect wrapper to the real destination URL. */
function decodeDuckDuckGoHref(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    if (target) return decodeURIComponent(target);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/** Removes tags and decodes the handful of HTML entities DuckDuckGo emits. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts organic results from a Google SERP. Runs inside the browser via
 * `page.evaluate`, so it must be self-contained and reference only DOM globals.
 */
function extractGoogleHitsFromPage(limit: number): WebSearchHit[] {
  const doc = (globalThis as { document?: any }).document;
  if (!doc?.querySelectorAll) return [];
  const clean = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

  const out: WebSearchHit[] = [];
  const seen = new Set<string>();

  for (const heading of Array.from(doc.querySelectorAll('a h3')) as any[]) {
    if (out.length >= limit) break;
    const anchor = heading.closest?.('a');
    const href: string | undefined = anchor?.getAttribute?.('href');
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (/^https?:\/\/(?:www\.)?google\./i.test(href)) continue;
    if (seen.has(href)) continue;
    const title = clean(heading.textContent);
    if (!title) continue;
    seen.add(href);

    const block = anchor.closest?.('div.g') ?? anchor.parentElement?.parentElement;
    let snippet = '';
    const snippetNode =
      block?.querySelector?.('div[data-sncf], div[data-content-feature], .VwiC3b, .yXK7lf') ??
      block?.querySelector?.('span');
    if (snippetNode) snippet = clean(snippetNode.textContent);

    out.push({ title, link: href, snippet });
  }

  return out;
}
