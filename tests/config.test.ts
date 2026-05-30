import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SYMBOLS,
  defaultSymbolsForExchange,
  FOREX_DEFAULT_SYMBOLS,
  loadConfig,
} from '../src/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaultSymbolsForExchange', () => {
  it('returns forex pairs for Pocket Option (incl. spaced/hyphenated spellings)', () => {
    expect(defaultSymbolsForExchange('pocketoption')).toEqual(FOREX_DEFAULT_SYMBOLS);
    expect(defaultSymbolsForExchange('Pocket Option')).toEqual(FOREX_DEFAULT_SYMBOLS);
    expect(defaultSymbolsForExchange('pocket-option')).toEqual(FOREX_DEFAULT_SYMBOLS);
  });

  it('returns crypto tickers for spot venues and when no exchange is given', () => {
    expect(defaultSymbolsForExchange('bybit')).toEqual(DEFAULT_SYMBOLS);
    expect(defaultSymbolsForExchange()).toEqual(DEFAULT_SYMBOLS);
  });

  it('hands back a fresh copy so callers cannot mutate the shared default list', () => {
    const a = defaultSymbolsForExchange('pocketoption');
    a.push('XXXYYY');
    expect(defaultSymbolsForExchange('pocketoption')).toEqual(FOREX_DEFAULT_SYMBOLS);
  });
});

describe('loadConfig symbol defaults', () => {
  it('defaults Pocket Option runs to forex pairs when TRADEFAST_SYMBOLS is unset', () => {
    vi.stubEnv('TRADEFAST_SYMBOLS', '');
    expect(loadConfig({ exchange: 'pocketoption' }).symbols).toEqual(FOREX_DEFAULT_SYMBOLS);
  });

  it('keeps crypto defaults for spot venues', () => {
    vi.stubEnv('TRADEFAST_SYMBOLS', '');
    expect(loadConfig({ exchange: 'bybit' }).symbols).toEqual(DEFAULT_SYMBOLS);
  });

  it('always honours an explicit TRADEFAST_SYMBOLS list over venue defaults', () => {
    vi.stubEnv('TRADEFAST_SYMBOLS', 'AUDUSD, NZDUSD');
    expect(loadConfig({ exchange: 'pocketoption' }).symbols).toEqual(['AUDUSD', 'NZDUSD']);
  });
});
