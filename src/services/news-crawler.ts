import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import configuredNewsSources from '../config/news-sources.json' with { type: 'json' };

export type NewsSourceKind = 'economic-calendar' | 'news' | 'market';

export interface NewsSource {
  id: string;
  title: string;
  kind: NewsSourceKind;
  url: string;
  enabled?: boolean;
  maxItems?: number;
}

export interface NewsCandidate {
  title: string;
  url?: string;
  summary?: string;
  publishedAt?: string;
}

export interface NewsItem {
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  kind: NewsSourceKind;
  title: string;
  url?: string;
  summary?: string;
  publishedAt?: string;
  fetchedAt: string;
  contentHash: string;
}

export interface NewsPageSnapshot {
  pageTitle?: string;
  candidates: NewsCandidate[];
}

export interface NewsFetchOptions {
  timeoutMs: number;
  scrollPasses: number;
  settleMs: number;
  maxCandidates: number;
}

export interface NewsPageFetcher {
  readonly name: string;
  fetch(source: NewsSource, options: NewsFetchOptions): Promise<NewsPageSnapshot>;
  close(): Promise<void>;
}

export interface NewsCrawlOptions {
  maxItemsPerSource?: number;
  timeoutMs?: number;
  scrollPasses?: number;
  settleMs?: number;
  sourceIds?: string[];
  now?: () => Date;
}

export interface NewsCrawlProgress {
  phase: 'fetch' | 'persist' | 'done';
  sourceId?: string;
  message: string;
  step: number;
  totalSteps: number;
}

export interface NewsSourceReport {
  sourceId: string;
  title: string;
  url: string;
  fetched: number;
  accepted: number;
  failed: boolean;
  error?: string;
}

export interface NewsCrawlReport {
  sources: NewsSourceReport[];
  items: NewsItem[];
  durationMs: number;
}

export type NewsProgressListener = (event: NewsCrawlProgress) => void;

const DEFAULT_MAX_ITEMS_PER_SOURCE = 8;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SCROLL_PASSES = 2;
const DEFAULT_SETTLE_MS = 700;
const MIN_TITLE_LENGTH = 8;

const NAVIGATION_TITLES = new Set([
  'главная',
  'войти',
  'меню',
  'новости',
  'подписаться',
  'регистрация',
  'search',
  'sign in',
]);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const DEFAULT_NEWS_SOURCES: NewsSource[] = validateNewsSources(configuredNewsSources);

export async function loadNewsSources(file = process.env.LOSTFAST_NEWS_SOURCES_FILE): Promise<NewsSource[]> {
  if (!file) return DEFAULT_NEWS_SOURCES.map((source) => ({ ...source }));
  const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
  return validateNewsSources(parsed);
}

export async function createNewsCrawler(): Promise<NewsCrawler> {
  const sources = await loadNewsSources();
  return new NewsCrawler(sources, new PlaywrightNewsPageFetcher(), {
    maxItemsPerSource: envNumber('LOSTFAST_NEWS_LIMIT', DEFAULT_MAX_ITEMS_PER_SOURCE),
  });
}

export class NewsCrawler {
  constructor(
    private readonly sources: readonly NewsSource[],
    private readonly fetcher: NewsPageFetcher,
    private readonly options: NewsCrawlOptions = {},
  ) {}

  async crawl(onProgress?: NewsProgressListener): Promise<NewsCrawlReport> {
    const started = Date.now();
    const activeSources = this.sources
      .filter((source) => source.enabled !== false)
      .filter((source) => !this.options.sourceIds || this.options.sourceIds.includes(source.id));
    const totalSteps = activeSources.length + 1;
    let step = 0;
    const emit = (event: Omit<NewsCrawlProgress, 'step' | 'totalSteps'>) =>
      onProgress?.({ ...event, step: ++step, totalSteps });

    const reports: NewsSourceReport[] = [];
    const items: NewsItem[] = [];

    try {
      for (const source of activeSources) {
        emit({ phase: 'fetch', sourceId: source.id, message: `Crawling ${source.title}` });
        try {
          const limit = this.maxItemsFor(source);
          const snapshot = await this.fetcher.fetch(source, {
            timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            scrollPasses: this.options.scrollPasses ?? DEFAULT_SCROLL_PASSES,
            settleMs: this.options.settleMs ?? DEFAULT_SETTLE_MS,
            maxCandidates: limit * 4,
          });
          const normalized = normalizeCandidates(source, snapshot.candidates, limit, this.now());
          items.push(...normalized.items);
          reports.push({
            sourceId: source.id,
            title: source.title,
            url: source.url,
            fetched: normalized.considered,
            accepted: normalized.items.length,
            failed: false,
          });
        } catch (error) {
          reports.push({
            sourceId: source.id,
            title: source.title,
            url: source.url,
            fetched: 0,
            accepted: 0,
            failed: true,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      await this.fetcher.close();
    }

    emit({ phase: 'done', message: `News crawl completed for ${activeSources.length} source(s)` });
    return { sources: reports, items, durationMs: Date.now() - started };
  }

  private maxItemsFor(source: NewsSource): number {
    return this.options.maxItemsPerSource ?? source.maxItems ?? DEFAULT_MAX_ITEMS_PER_SOURCE;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export class PlaywrightNewsPageFetcher implements NewsPageFetcher {
  readonly name = 'playwright-news';
  private browser: unknown = null;

  async fetch(source: NewsSource, options: NewsFetchOptions): Promise<NewsPageSnapshot> {
    const browser = await this.ensureBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (browser as any).newPage();
    try {
      await page.setExtraHTTPHeaders({
        'accept-language': 'ru,en;q=0.9',
        'user-agent': 'LostfastNewsCrawler/0.2 (+https://github.com/Payel-git-ol/Lostfast)',
      });
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: Math.min(options.timeoutMs, 5_000) }).catch(() => {});
      for (let i = 0; i < options.scrollPasses; i++) {
        await page.evaluate(() => {
          const w = globalThis as { scrollBy?: (x: number, y: number) => void; innerHeight?: number };
          w.scrollBy?.(0, Math.max(w.innerHeight ?? 800, 400));
        });
        await page.waitForTimeout(options.settleMs);
      }
      const pageTitle: string = await page.title();
      const candidates = (await page.evaluate(extractCandidatesFromPage, {
        baseUrl: source.url,
        maxCandidates: options.maxCandidates,
      })) as NewsCandidate[];
      return { pageTitle, candidates };
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

function normalizeCandidates(
  source: NewsSource,
  candidates: readonly NewsCandidate[],
  limit: number,
  fetchedAt: Date,
): { items: NewsItem[]; considered: number } {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  let considered = 0;

  for (const candidate of candidates) {
    const title = normalizeText(candidate.title);
    if (!isLikelyNewsTitle(title)) continue;
    considered++;

    const url = normalizeUrl(candidate.url, source.url);
    const key = `${url ?? ''}\n${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const summary = normalizeOptionalText(candidate.summary, 500);
    const publishedAt = normalizeDate(candidate.publishedAt);
    const item: NewsItem = {
      sourceId: source.id,
      sourceTitle: source.title,
      sourceUrl: source.url,
      kind: source.kind,
      title,
      url,
      summary: summary && summary !== title ? summary : undefined,
      publishedAt,
      fetchedAt: fetchedAt.toISOString(),
      contentHash: sha256([source.id, title, url ?? '', summary ?? '', publishedAt ?? ''].join('\n')),
    };
    items.push(item);
    if (items.length >= limit) break;
  }

  return { items, considered };
}

function extractCandidatesFromPage({
  baseUrl,
  maxCandidates,
}: {
  baseUrl: string;
  maxCandidates: number;
}): NewsCandidate[] {
  const doc = (globalThis as { document?: any }).document;
  if (!doc?.querySelectorAll) return [];
  const clean = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const cleanOptional = (value: unknown): string | undefined => {
    const normalized = clean(value);
    return normalized ? normalized.slice(0, 500) : undefined;
  };

  const selectors = [
    'article a[href]',
    'h1 a[href]',
    'h2 a[href]',
    'h3 a[href]',
    '[class*="news" i] a[href]',
    '[class*="article" i] a[href]',
    '[class*="calendar" i] a[href]',
    '[class*="event" i] a[href]',
    'a[href]',
  ];
  const anchors: any[] = [];
  const seenNodes = new Set<any>();
  for (const selector of selectors) {
    for (const node of Array.from(doc.querySelectorAll(selector)) as any[]) {
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);
      anchors.push(node);
      if (anchors.length >= maxCandidates * 3) break;
    }
    if (anchors.length >= maxCandidates * 3) break;
  }

  const out: NewsCandidate[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    const href = anchor.getAttribute?.('href');
    const title = clean(anchor.textContent || anchor.getAttribute?.('aria-label') || anchor.getAttribute?.('title') || '');
    if (!href || !title) continue;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    const container =
      anchor.closest?.('article, li, tr, [class*="news" i], [class*="article" i], [class*="calendar" i], div') ??
      anchor.parentElement;
    const summary = cleanOptional(container?.textContent);
    const timeNode = container?.querySelector?.('time[datetime], time, [datetime]');
    const publishedAt = timeNode?.getAttribute?.('datetime') ?? undefined;
    const key = `${absolute}\n${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: absolute, summary, publishedAt });
    if (out.length >= maxCandidates) break;
  }

  return out;
}

function validateNewsSources(value: unknown): NewsSource[] {
  if (!Array.isArray(value)) throw new Error('News source config must be an array');
  return value.map((entry, index) => parseNewsSource(entry, index));
}

function parseNewsSource(entry: unknown, index: number): NewsSource {
  if (!isRecord(entry)) throw new Error(`News source at index ${index} must be an object`);
  const id = requireString(entry.id, `sources[${index}].id`);
  const title = requireString(entry.title, `sources[${index}].title`);
  const url = requireString(entry.url, `sources[${index}].url`);
  const kind = requireString(entry.kind, `sources[${index}].kind`);
  if (!['economic-calendar', 'news', 'market'].includes(kind)) {
    throw new Error(`sources[${index}].kind must be economic-calendar, news, or market`);
  }
  try {
    new URL(url);
  } catch {
    throw new Error(`sources[${index}].url must be an absolute URL`);
  }
  return {
    id,
    title,
    url,
    kind: kind as NewsSourceKind,
    enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
    maxItems: typeof entry.maxItems === 'number' && entry.maxItems > 0 ? Math.floor(entry.maxItems) : undefined,
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLikelyNewsTitle(title: string): boolean {
  if (title.length < MIN_TITLE_LENGTH) return false;
  return !NAVIGATION_TITLES.has(title.toLowerCase());
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeUrl(value: unknown, baseUrl: string): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
