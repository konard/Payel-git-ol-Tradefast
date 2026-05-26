import { describe, expect, it } from 'vitest';

import type { Candle } from '../src/domain/candle.js';
import {
  aggregateBacktests,
  backtestSymbol,
  simulateTrade,
  type BacktestResult,
} from '../src/services/backtest.js';

/** One OHLCV bar. `volume` is irrelevant to the simulation, so it is fixed. */
const bar = (open: number, high: number, low: number, close: number, i = 0): Candle => ({
  openTime: i * 3_600_000,
  open,
  high,
  low,
  close,
  volume: 1_000,
});

/** Build a candle series from a list of close prices (tight, well-formed bars). */
const series = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({
    openTime: i * 3_600_000,
    open: i === 0 ? close : closes[i - 1],
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 1_000,
  }));

// A long forecast risking 5 points with a 2:1 target: entry 100, TP 110, SL 95.
const longForecast = { direction: 'long' as const, entry: 100, tp: 110, sl: 95, stopDistance: 5 };
const shortForecast = { direction: 'short' as const, entry: 100, tp: 90, sl: 105, stopDistance: 5 };

describe('simulateTrade', () => {
  it('books +2R when a long reaches take-profit before its stop', () => {
    const candles = [bar(100, 101, 99, 100, 0), bar(100, 111, 100, 108, 1)];
    const trade = simulateTrade(candles, 0, longForecast, 48);

    expect(trade.outcome).toBe('tp');
    expect(trade.exitPrice).toBe(110);
    expect(trade.rMultiple).toBeCloseTo(2, 8);
    expect(trade.exitIndex).toBe(1);
  });

  it('books -1R when a long hits its stop first', () => {
    const candles = [bar(100, 101, 99, 100, 0), bar(100, 101, 94, 96, 1)];
    const trade = simulateTrade(candles, 0, longForecast, 48);

    expect(trade.outcome).toBe('sl');
    expect(trade.exitPrice).toBe(95);
    expect(trade.rMultiple).toBeCloseTo(-1, 8);
  });

  it('books +2R when a short reaches take-profit', () => {
    const candles = [bar(100, 101, 99, 100, 0), bar(100, 100, 89, 92, 1)];
    const trade = simulateTrade(candles, 0, shortForecast, 48);

    expect(trade.outcome).toBe('tp');
    expect(trade.exitPrice).toBe(90);
    expect(trade.rMultiple).toBeCloseTo(2, 8);
  });

  it('fills the stop first when a single bar spans both levels (conservative tie-break)', () => {
    // This bar's range covers both TP (110) and SL (95); the stop must win.
    const candles = [bar(100, 101, 99, 100, 0), bar(100, 112, 94, 105, 1)];
    const trade = simulateTrade(candles, 0, longForecast, 48);

    expect(trade.outcome).toBe('sl');
    expect(trade.rMultiple).toBeCloseTo(-1, 8);
  });

  it('marks to market at the last close when neither level is reached within the horizon', () => {
    const candles = [bar(100, 101, 99, 100, 0), bar(100, 104, 98, 103, 1), bar(103, 106, 101, 105, 2)];
    const trade = simulateTrade(candles, 0, longForecast, 1); // horizon of one bar

    expect(trade.outcome).toBe('timeout');
    expect(trade.exitIndex).toBe(1);
    expect(trade.exitPrice).toBe(103);
    // (103 - 100) / 5 = +0.6R, a partial gain at the horizon.
    expect(trade.rMultiple).toBeCloseTo(0.6, 8);
  });

  it('never looks at the entry bar — only bars strictly after it decide the outcome', () => {
    // The entry bar (index 0) already spans both levels, but it must be ignored;
    // the flat bars that follow leave the trade open until it times out.
    const candles = [bar(100, 200, 50, 100, 0), bar(100, 101, 99, 100, 1), bar(100, 101, 99, 100, 2)];
    const trade = simulateTrade(candles, 0, longForecast, 48);

    expect(trade.outcome).toBe('timeout');
    expect(trade.exitIndex).toBe(2);
  });
});

describe('backtestSymbol', () => {
  it('returns a zero-trade result for a series too short to warm up', () => {
    const result = backtestSymbol(series([100, 101, 102, 103]), 'TEST', { warmup: 60 });
    expect(result.trades).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.expectancy).toBe(0);
  });

  it('produces non-overlapping trades whose exit always precedes the next entry', () => {
    const upTrend = series(Array.from({ length: 200 }, (_, i) => 100 + i * 1.5));
    const result = backtestSymbol(upTrend, 'TEST', { warmup: 60, horizon: 24 });

    expect(result.trades).toBeGreaterThan(0);
    const trades = result.outcomes;
    for (let k = 1; k < trades.length; k++) {
      expect(trades[k].entryIndex).toBeGreaterThan(trades[k - 1].exitIndex);
    }
  });

  it('reports a winning edge on a clean, persistent uptrend', () => {
    const upTrend = series(Array.from({ length: 200 }, (_, i) => 100 + i * 1.5));
    const result = backtestSymbol(upTrend, 'TEST', { warmup: 60, horizon: 24 });

    expect(result.wins).toBeGreaterThan(result.losses);
    expect(result.expectancy).toBeGreaterThan(0);
  });

  it('keeps win rate within [0, 1] and counts add up to the trade total', () => {
    const upTrend = series(Array.from({ length: 200 }, (_, i) => 100 + i * 1.5));
    const result = backtestSymbol(upTrend, 'TEST', { warmup: 60, horizon: 24 });

    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.wins + result.losses + result.timeouts).toBe(result.trades);
  });
});

describe('aggregateBacktests', () => {
  const make = (over: Partial<BacktestResult>): BacktestResult => ({
    symbol: 'X',
    candles: 100,
    trades: 0,
    wins: 0,
    losses: 0,
    timeouts: 0,
    winRate: 0,
    expectancy: 0,
    totalR: 0,
    profitFactor: 0,
    outcomes: [],
    ...over,
  });

  it('sums trades and recomputes portfolio win rate from decided trades', () => {
    const a = make({
      trades: 2,
      wins: 1,
      losses: 1,
      totalR: 1,
      outcomes: [
        { entryIndex: 1, direction: 'long', entry: 100, tp: 110, sl: 95, outcome: 'tp', exitIndex: 2, exitPrice: 110, barsHeld: 1, rMultiple: 2 },
        { entryIndex: 3, direction: 'long', entry: 100, tp: 110, sl: 95, outcome: 'sl', exitIndex: 4, exitPrice: 95, barsHeld: 1, rMultiple: -1 },
      ],
    });
    const b = make({
      trades: 1,
      wins: 1,
      totalR: 2,
      outcomes: [
        { entryIndex: 1, direction: 'short', entry: 100, tp: 90, sl: 105, outcome: 'tp', exitIndex: 2, exitPrice: 90, barsHeld: 1, rMultiple: 2 },
      ],
    });

    const report = aggregateBacktests([a, b]);
    expect(report.totals.symbols).toBe(2);
    expect(report.totals.trades).toBe(3);
    expect(report.totals.wins).toBe(2);
    expect(report.totals.losses).toBe(1);
    // 2 wins of 3 decided trades.
    expect(report.totals.winRate).toBeCloseTo(2 / 3, 8);
    // Mean R across 3 trades: (2 - 1 + 2) / 3.
    expect(report.totals.expectancy).toBeCloseTo(3 / 3, 8);
    // Gross win 4R over gross loss 1R.
    expect(report.totals.profitFactor).toBeCloseTo(4, 8);
  });

  it('reports an infinite profit factor when nothing loses', () => {
    const a = make({
      trades: 1,
      wins: 1,
      totalR: 2,
      outcomes: [
        { entryIndex: 1, direction: 'long', entry: 100, tp: 110, sl: 95, outcome: 'tp', exitIndex: 2, exitPrice: 110, barsHeld: 1, rMultiple: 2 },
      ],
    });
    expect(aggregateBacktests([a]).totals.profitFactor).toBe(Infinity);
  });

  it('reports a zero profit factor with no trades at all', () => {
    expect(aggregateBacktests([]).totals.profitFactor).toBe(0);
    expect(aggregateBacktests([]).totals.winRate).toBe(0);
  });
});
