import { CLEAR_MUTATION, type ClearResult } from './clear.js';
import { GraphqlClient } from './client.js';
import { START_MUTATION, UPDATE_MUTATION, type RunReport, type StartResult, type UpdateResult } from './run-report.js';
import { STATUS_QUERY, type Status, type StatusResult } from './status.js';
import { STRATEGIES_QUERY, type Strategy, type StrategiesResult } from './strategy.js';
import { WEB_SEARCH_QUERY, type WebSearchHit, type WebSearchResult } from './web-search.js';

/**
 * The frontend repository. Every API request the CLI makes goes through this
 * object, which turns a call like {@link status} into a GraphQL document sent to
 * the backend. It is the client end of the `cli → graphql → backend` path and
 * the only place in the frontend that knows the API exists.
 */
export class GraphqlTradefastRepository {
  private readonly client: GraphqlClient;

  constructor(url: string, fetchImpl: typeof fetch = fetch) {
    this.client = new GraphqlClient(url, fetchImpl);
  }

  async status(): Promise<Status> {
    const data = await this.client.request<StatusResult>(STATUS_QUERY);
    return data.status;
  }

  async strategies(): Promise<Strategy[]> {
    const data = await this.client.request<StrategiesResult>(STRATEGIES_QUERY);
    return data.strategies;
  }

  async start(): Promise<RunReport> {
    const data = await this.client.request<StartResult>(START_MUTATION);
    return data.start;
  }

  async update(): Promise<RunReport> {
    const data = await this.client.request<UpdateResult>(UPDATE_MUTATION);
    return data.update;
  }

  async clear(): Promise<number> {
    const data = await this.client.request<ClearResult>(CLEAR_MUTATION);
    return data.clear;
  }

  async webSearch(query: string, limit?: number): Promise<WebSearchHit[]> {
    const data = await this.client.request<WebSearchResult>(WEB_SEARCH_QUERY, { query, limit });
    return data.webSearch;
  }
}
