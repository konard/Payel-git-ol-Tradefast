import { createDb, type DbHandle } from '../db/client.js';
import { LostfastStore } from '../db/store.js';
import type { AnalyticsRow } from '../db/store.js';
import { loadConfig, type LostfastConfig } from '../config.js';
import { CollectionPipeline, type ProgressListener, type RunReport } from '../pipeline/collector.js';
import {
  createNewsCrawler,
  type NewsCrawler,
  type NewsCrawlReport,
  type NewsProgressListener,
} from '../services/news-crawler.js';
import { ALL_STRATEGIES } from '../strategies/registry.js';

export interface StatusReport {
  driver: string;
  counts: Record<string, number>;
  latestRunId?: number;
  latestAnalytics: AnalyticsRow[];
}

export interface PersistedNewsCrawlReport extends NewsCrawlReport {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * The application facade. It owns the database handle, the store and the
 * collection pipeline, and exposes the lifecycle/news operations the CLI needs
 * plus read-only status. Keeping this logic out of the UI means the same
 * behaviour backs both the interactive shell and the non-interactive subcommands.
 */
export class Lostfast {
  private constructor(
    private readonly handle: DbHandle,
    private readonly store: LostfastStore,
    private readonly pipeline: CollectionPipeline,
    private readonly newsCrawler: NewsCrawler,
    readonly config: LostfastConfig,
  ) {}

  static async create(config: LostfastConfig = loadConfig()): Promise<Lostfast> {
    const handle = await createDb();
    const store = new LostfastStore(handle.db);
    const pipeline = new CollectionPipeline(store);
    const newsCrawler = await createNewsCrawler();
    return new Lostfast(handle, store, pipeline, newsCrawler, config);
  }

  get driver(): string {
    return this.handle.driver;
  }

  /** `/start` — clear prior run data (keeping the search table) and analyse afresh. */
  start(onProgress?: ProgressListener): Promise<RunReport> {
    return this.pipeline.collect(
      'start',
      {
        symbols: this.config.symbols,
        interval: this.config.interval,
        limit: this.config.candleLimit,
        accountBalance: this.config.accountBalance,
      },
      onProgress,
    );
  }

  /** `/update` — re-analyse, writing only rows that actually changed. */
  update(onProgress?: ProgressListener): Promise<RunReport> {
    return this.pipeline.collect(
      'update',
      {
        symbols: this.config.symbols,
        interval: this.config.interval,
        limit: this.config.candleLimit,
        accountBalance: this.config.accountBalance,
      },
      onProgress,
    );
  }

  /** `/clear` — prune outdated runs; the general search table is preserved. */
  clear(): Promise<number> {
    return this.store.pruneOutdated();
  }

  async news(onProgress?: NewsProgressListener): Promise<PersistedNewsCrawlReport> {
    const crawlReport = await this.newsCrawler.crawl(onProgress);
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const item of crawlReport.items) {
      const result = await this.store.saveNewsItem(item);
      if (result === 'inserted') inserted++;
      else if (result === 'updated') updated++;
      else unchanged++;
    }
    return { ...crawlReport, inserted, updated, unchanged };
  }

  async status(): Promise<StatusReport> {
    const counts = await this.store.tableCounts();
    const latestRunId = await this.store.latestRunId();
    const latestAnalytics = latestRunId ? await this.store.latestAnalytics(latestRunId) : [];
    return { driver: this.driver, counts, latestRunId, latestAnalytics };
  }

  strategies(): { id: string; title: string }[] {
    return ALL_STRATEGIES.map((s) => ({ id: s.id, title: s.title }));
  }

  close(): Promise<void> {
    return this.handle.close();
  }
}
