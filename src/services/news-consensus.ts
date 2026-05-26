/**
 * News-driven Crowd Consensus engine.
 *
 * Extracts instruments (crypto + forex + macro + commodities + indices)
 * from the news that the crawler scrapes (especially economic calendars).
 *
 * Computes simple crowd bias (bullish / bearish) per instrument.
 * This powers the "very large table with everything the crawler found".
 *
 * Bias formula (v1):
 *   bias = (bullish - bearish) / max(1, mentions)
 *   clamped to [-1, 1]
 *
 * Later can be extended with Markov chains on sequences of news.
 */

import type { NewsItem } from './news-crawler.js';

export interface InstrumentConsensus {
  instrument: string;
  mentions: number;
  bullish: number;
  bearish: number;
  neutral: number;
  crowdBias: number; // -1 .. +1
}

const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'BNB', 'AVAX', 'DOT', 'LINK', 'LTC', 'NEAR', 'APT', 'ARB', 'SUI', 'TON', 'PEPE'];

const FOREX_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY'
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD', 'RUB'];

const COMMODITIES = ['Gold', 'Oil', 'Silver', 'Natural Gas', 'Copper'];

const INDICES = ['S&P 500', 'Nasdaq', 'Dow', 'S&P500', 'US500', 'US Tech 100', 'Germany 30', 'DAX', 'Nikkei'];

const MACRO_EVENTS = [
  'NFP', 'Nonfarm Payrolls', 'CPI', 'Inflation', 'Fed Rate', 'FOMC',
  'ECB Rate', 'GDP', 'Unemployment', 'Retail Sales', 'PPI', 'Interest Rate'
];

// Normalization map: raw text -> canonical instrument
const ALIASES: Record<string, string> = {
  // crypto
  bitcoin: 'BTC', btc: 'BTC',
  ethereum: 'ETH', eth: 'ETH',
  solana: 'SOL', sol: 'SOL',
  ripple: 'XRP', xrp: 'XRP',
  dogecoin: 'DOGE', doge: 'DOGE',
  // forex pairs
  'eur/usd': 'EUR/USD', 'eur usd': 'EUR/USD', eurodollar: 'EUR/USD',
  'gbp/usd': 'GBP/USD', 'gbp usd': 'GBP/USD', cable: 'GBP/USD',
  'usd/jpy': 'USD/JPY', 'usd jpy': 'USD/JPY',
  'aud/usd': 'AUD/USD',
  'usd/cad': 'USD/CAD',
  // currencies
  dollar: 'USD', 'us dollar': 'USD', usd: 'USD',
  euro: 'EUR', eur: 'EUR',
  'british pound': 'GBP', pound: 'GBP', gbp: 'GBP',
  yen: 'JPY', jpy: 'JPY',
  // commodities
  gold: 'Gold', xau: 'Gold',
  'crude oil': 'Oil', oil: 'Oil', wti: 'Oil',
  silver: 'Silver',
  // indices
  's&p 500': 'S&P 500', 's&p500': 'S&P 500', sp500: 'S&P 500', 'us 500': 'S&P 500',
  nasdaq: 'Nasdaq', 'tech 100': 'Nasdaq',
  dax: 'DAX', 'germany 30': 'DAX',
  // macro
  'non-farm payrolls': 'NFP', nfp: 'NFP', 'non farm': 'NFP',
  'consumer price index': 'CPI', cpi: 'CPI',
  'federal funds rate': 'Fed Rate', 'fed rate': 'Fed Rate', fomc: 'FOMC',
  'interest rate decision': 'Interest Rate',
  gdp: 'GDP',
};

// Bullish / Bearish keywords (Russian + English) — economic calendar context
const BULLISH = [
  'рост', 'выше', 'сильнее', 'позитив', 'hawkish', 'better than expected',
  'strong', 'above forecast', 'higher', 'beat', 'up', 'rally', 'повышение ставки',
  'inflation hotter', 'stronger dollar', 'risk on'
];

const BEARISH = [
  'падение', 'ниже', 'слабее', 'негатив', 'dovish', 'worse than expected',
  'weak', 'below forecast', 'lower', 'miss', 'down', 'sell off', 'понижение',
  'rate cut', 'recession fears', 'risk off', 'dollar weaker'
];

/**
 * Extracts all known instruments mentioned in the given text.
 * Returns normalized canonical names (e.g. 'EUR/USD', 'NFP', 'Gold').
 */
export function extractInstruments(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Set<string>();

  // Check aliases first (most specific)
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) {
      found.add(canonical);
    }
  }

  // Direct matches for lists
  for (const c of CRYPTO) if (lower.includes(c.toLowerCase())) found.add(c);
  for (const p of FOREX_PAIRS) if (lower.includes(p.toLowerCase())) found.add(p);
  for (const cur of CURRENCIES) if (lower.includes(cur.toLowerCase())) found.add(cur);
  for (const com of COMMODITIES) if (lower.includes(com.toLowerCase())) found.add(com);
  for (const idx of INDICES) if (lower.includes(idx.toLowerCase())) found.add(idx);
  for (const ev of MACRO_EVENTS) if (lower.includes(ev.toLowerCase())) found.add(ev);

  return Array.from(found);
}

/** Simple sentiment scoring for a piece of text regarding a specific instrument. */
export function scoreSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = text.toLowerCase();
  let bull = 0;
  let bear = 0;

  for (const w of BULLISH) if (lower.includes(w)) bull++;
  for (const w of BEARISH) if (lower.includes(w)) bear++;

  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

/**
 * Computes crowd consensus from a list of news items.
 * This is the core of the "big table".
 */
export function computeCrowdConsensus(items: NewsItem[]): InstrumentConsensus[] {
  const map = new Map<string, { mentions: number; bullish: number; bearish: number; neutral: number }>();

  for (const item of items) {
    const text = `${item.title} ${item.summary ?? ''}`;
    const instruments = extractInstruments(text);
    if (instruments.length === 0) continue;

    const sentiment = scoreSentiment(text);

    for (const inst of instruments) {
      if (!map.has(inst)) {
        map.set(inst, { mentions: 0, bullish: 0, bearish: 0, neutral: 0 });
      }
      const row = map.get(inst)!;
      row.mentions++;
      if (sentiment === 'bullish') row.bullish++;
      else if (sentiment === 'bearish') row.bearish++;
      else row.neutral++;
    }
  }

  const result: InstrumentConsensus[] = [];
  for (const [instrument, counts] of map.entries()) {
    const bias = (counts.bullish - counts.bearish) / Math.max(1, counts.mentions);
    result.push({
      instrument,
      mentions: counts.mentions,
      bullish: counts.bullish,
      bearish: counts.bearish,
      neutral: counts.neutral,
      crowdBias: Math.max(-1, Math.min(1, bias)),
    });
  }

  // Sort by |bias| * mentions (most interesting first)
  result.sort((a, b) => {
    const scoreA = Math.abs(a.crowdBias) * a.mentions;
    const scoreB = Math.abs(b.crowdBias) * b.mentions;
    return scoreB - scoreA;
  });

  return result;
}
