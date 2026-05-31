import { describe, expect, it } from 'vitest';

import type { TradefastApiFacade } from '../src/backend/graphql/index.js';
import { startTradefastBackend } from '../src/backend/server.js';
import { GraphqlClient, GraphqlRequestError, GraphqlTradefastRepository } from '../src/cli/graphql/index.js';

const facade: TradefastApiFacade = {
  driver: 'pglite',
  strategies: () => [{ id: 'trend-following', title: 'Trend Following' }],
  status: async () => ({
    driver: 'pglite',
    counts: { runs: 1, candles: 20 },
    latestRunId: 7,
    latestAnalytics: [
      {
        symbol: 'BTCUSDT',
        consensusScore: 0.42,
        longCount: 4,
        shortCount: 1,
        neutralCount: 8,
        strongestStrategy: 'trend-following',
        strongestStrength: 0.7,
        lastPrice: 60_000,
        atr: 120,
      },
    ],
  }),
  start: async () => ({
    runId: 2,
    kind: 'start',
    symbols: [
      {
        symbol: 'BTCUSDT',
        analysis: {} as never,
        insight: 'flat',
        candlesAdded: 5,
        signalsInserted: 3,
        signalsUpdated: 1,
        signalsUnchanged: 0,
        scrapesAdded: 0,
        assessment: '',
      },
    ],
    searchResults: 0,
    durationMs: 1,
    validation: null,
    interval: '1h',
  }),
  update: async () => ({
    runId: 3,
    kind: 'update',
    symbols: [],
    searchResults: 0,
    durationMs: 1,
    validation: null,
    interval: '1h',
  }),
  clear: async () => 4,
};

describe('GraphqlTradefastRepository', () => {
  it('drives the real backend through the cli → graphql → backend path', async () => {
    const backend = await startTradefastBackend(facade);
    const repository = new GraphqlTradefastRepository(backend.url);

    try {
      const status = await repository.status();
      expect(status.driver).toBe('pglite');
      expect(status.latestRunId).toBe(7);
      expect(status.counts).toEqual([
        { name: 'runs', count: 1 },
        { name: 'candles', count: 20 },
      ]);
      expect(status.latestAnalytics[0]).toMatchObject({ symbol: 'BTCUSDT', lastPrice: 60_000 });

      await expect(repository.strategies()).resolves.toEqual([
        { id: 'trend-following', title: 'Trend Following' },
      ]);

      const started = await repository.start();
      expect(started).toMatchObject({ runId: 2, kind: 'start' });
      expect(started.symbols[0]).toMatchObject({ symbol: 'BTCUSDT', candlesAdded: 5 });

      await expect(repository.update()).resolves.toMatchObject({ runId: 3, kind: 'update' });
      await expect(repository.clear()).resolves.toBe(4);
    } finally {
      await backend.close();
    }
  });
});

describe('GraphqlClient', () => {
  it('throws when the backend returns GraphQL errors', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const client = new GraphqlClient('http://example.invalid/graphql', fakeFetch);

    await expect(client.request('{ status { driver } }')).rejects.toBeInstanceOf(GraphqlRequestError);
  });

  it('throws on a non-2xx HTTP response', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const client = new GraphqlClient('http://example.invalid/graphql', fakeFetch);

    await expect(client.request('{ status { driver } }')).rejects.toThrow(/HTTP 500/u);
  });
});
