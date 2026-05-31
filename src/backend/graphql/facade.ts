import type { StatusReport } from '../../app/tradefast.js';
import type { RunReport } from '../../pipeline/collector.js';
import type { SearchResult } from '../../services/search.js';

/** DI token under which the application facade is provided to the resolver. */
export const TRADEFAST_FACADE = Symbol('TRADEFAST_FACADE');

/**
 * The slice of the {@link Tradefast} application the GraphQL backend depends on.
 * Keeping it an interface lets tests provide a lightweight stand-in and keeps the
 * backend decoupled from the full application class.
 */
export interface TradefastApiFacade {
  readonly driver: string;
  status(): Promise<StatusReport>;
  strategies(): { id: string; title: string }[];
  start(): Promise<RunReport>;
  update(): Promise<RunReport>;
  clear(): Promise<number>;
  /** Whole-internet web search executed server-side. */
  search(query: string, limit?: number): Promise<SearchResult[]>;
}
