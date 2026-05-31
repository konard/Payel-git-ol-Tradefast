import { describe, expect, it } from 'vitest';

import { CompositeSearchProvider, KnowledgeBaseSearch, type SearchProvider } from '../src/services/search.js';
import {
  googleSearch,
  parseDuckDuckGoHtml,
  WebSearchProvider,
  type WebSearchEngine,
  type WebSearchHit,
} from '../src/services/web-search.js';

/** A deterministic offline engine so the suite never touches the network. */
class StubEngine implements WebSearchEngine {
  readonly name = 'stub';
  constructor(private readonly hits: WebSearchHit[]) {}
  async search(_query: string, options: { limit: number }): Promise<WebSearchHit[]> {
    return this.hits.slice(0, options.limit);
  }
}

const HITS: WebSearchHit[] = [
  { title: 'Bitcoin breakout analysis', link: 'https://example.com/btc', snippet: 'BTC clears resistance.' },
  { title: 'Crypto market recap', link: 'https://example.com/recap', snippet: 'Markets rally.' },
];

describe('googleSearch (web-agent-master/google-search API)', () => {
  it('returns the query alongside its hits, capped by limit', async () => {
    const response = await googleSearch('bitcoin', { limit: 1 }, new StubEngine(HITS));
    expect(response.query).toBe('bitcoin');
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toEqual(HITS[0]);
  });

  it('defaults to ten hits when no limit is given', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      title: `Result ${i}`,
      link: `https://example.com/${i}`,
      snippet: '',
    }));
    const response = await googleSearch('q', {}, new StubEngine(many));
    expect(response.results).toHaveLength(10);
  });
});

describe('WebSearchProvider', () => {
  it('maps hits into SearchResult rows with decaying scores', async () => {
    const provider = new WebSearchProvider(new StubEngine(HITS));
    const results = await provider.search('bitcoin', 'BTCUSDT');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      query: 'bitcoin',
      symbol: 'BTCUSDT',
      source: 'web-search',
      title: 'Bitcoin breakout analysis',
      url: 'https://example.com/btc',
      snippet: 'BTC clears resistance.',
    });
    // The first hit must outrank the second.
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('degrades to an empty list when the engine throws', async () => {
    const failing: WebSearchEngine = {
      name: 'boom',
      search: async () => {
        throw new Error('network down');
      },
    };
    const provider = new WebSearchProvider(failing);
    await expect(provider.search('bitcoin')).resolves.toEqual([]);
  });
});

describe('CompositeSearchProvider', () => {
  it('layers web search on top of the curated knowledge base', async () => {
    const composite = new CompositeSearchProvider(
      new KnowledgeBaseSearch(),
      new WebSearchProvider(new StubEngine(HITS)),
    );
    const results = await composite.search('trend following momentum', 'BTCUSDT');

    const sources = new Set(results.map((r) => r.source));
    expect(sources.has('knowledge-base')).toBe(true);
    expect(sources.has('web-search')).toBe(true);
    // Sorted by score descending.
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('survives a provider that throws', async () => {
    const failing: SearchProvider = {
      name: 'boom',
      search: async () => {
        throw new Error('boom');
      },
    };
    const composite = new CompositeSearchProvider(new KnowledgeBaseSearch(), failing);
    const results = await composite.search('rsi mean reversion');
    expect(results.length).toBeGreaterThan(0);
  });

  it('de-duplicates hits that share a URL', async () => {
    const dup: WebSearchHit[] = [
      { title: 'A', link: 'https://example.com/x', snippet: '' },
      { title: 'A copy', link: 'https://example.com/x', snippet: '' },
    ];
    const composite = new CompositeSearchProvider(new WebSearchProvider(new StubEngine(dup)));
    const results = await composite.search('q');
    expect(results).toHaveLength(1);
  });
});

describe('parseDuckDuckGoHtml (HTTP fallback engine)', () => {
  it('extracts titles, decoded links and snippets from the HTML SERP', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fbtc">Bitcoin &amp; markets</a>
        <a class="result__snippet">BTC clears <b>resistance</b> today</a>
      </div>
      <div class="result">
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Feth">Ethereum news</a>
        <a class="result__snippet">ETH update</a>
      </div>
    `;
    const hits = parseDuckDuckGoHtml(html, 10);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      title: 'Bitcoin & markets',
      link: 'https://example.com/btc',
      snippet: 'BTC clears resistance today',
    });
    expect(hits[1].link).toBe('https://example.com/eth');
  });

  it('honours the limit', () => {
    const html = Array.from({ length: 5 }, (_, i) =>
      `<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2F${i}">Title ${i}</a>`,
    ).join('\n');
    expect(parseDuckDuckGoHtml(html, 2)).toHaveLength(2);
  });
});
