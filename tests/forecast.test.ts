import { describe, expect, it } from 'vitest';

import type { Candle } from '../src/domain/candle.js';
import { AnalyticsService } from '../src/services/analytics.js';
import { buildForecast, REWARD_RISK_RATIO } from '../src/strategies/forecast.js';

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

const analytics = new AnalyticsService();
const upTrend = series(Array.from({ length: 80 }, (_, i) => 100 + i * 2));
const downTrend = series(Array.from({ length: 80 }, (_, i) => 300 - i * 2));

describe('buildForecast', () => {
  it('brackets a long entry with a 2:1 reward-to-risk target above and a 1R stop below', () => {
    const forecast = buildForecast(analytics.analyze(upTrend, 'TEST'));

    expect(forecast.direction).toBe('long');
    expect(forecast.entry).not.toBeNull();
    expect(forecast.stopDistance).not.toBeNull();

    const entry = forecast.entry as number;
    const stop = forecast.stopDistance as number;
    expect(stop).toBeGreaterThan(0);
    // TP sits REWARD_RISK_RATIO stop distances above entry; SL one below.
    expect(forecast.tp).toBeCloseTo(entry + stop * REWARD_RISK_RATIO, 8);
    expect(forecast.sl).toBeCloseTo(entry - stop, 8);
    // A long's stop is below entry and its target above.
    expect(forecast.sl as number).toBeLessThan(entry);
    expect(forecast.tp as number).toBeGreaterThan(entry);
  });

  it('mirrors the brackets for a short entry (target below, stop above)', () => {
    const forecast = buildForecast(analytics.analyze(downTrend, 'TEST'));

    expect(forecast.direction).toBe('short');
    const entry = forecast.entry as number;
    const stop = forecast.stopDistance as number;
    expect(stop).toBeGreaterThan(0);
    expect(forecast.tp).toBeCloseTo(entry - stop * REWARD_RISK_RATIO, 8);
    expect(forecast.sl).toBeCloseTo(entry + stop, 8);
    expect(forecast.tp as number).toBeLessThan(entry);
    expect(forecast.sl as number).toBeGreaterThan(entry);
  });

  it('anchors the entry on the latest close', () => {
    const forecast = buildForecast(analytics.analyze(upTrend, 'TEST'));
    expect(forecast.entry).toBe(upTrend[upTrend.length - 1].close);
  });

  it('returns no bracket levels when there is not enough data for a forecast', () => {
    const forecast = buildForecast(analytics.analyze(series([100, 101, 102]), 'TEST'));
    expect(forecast.tp).toBeNull();
    expect(forecast.sl).toBeNull();
    expect(forecast.stopDistance).toBeNull();
  });

  it('carries the analysed symbol through to the forecast', () => {
    const forecast = buildForecast(analytics.analyze(upTrend, 'XRPUSDT'));
    expect(forecast.symbol).toBe('XRPUSDT');
  });
});
