import { describe, expect, it } from 'vitest';

import type { Candle } from '../src/domain/candle.js';
import { AnalyticsService } from '../src/services/analytics.js';
import {
  buildForecast,
  EXPIRY_BARS,
  expiryMinutesFor,
  intervalMinutes,
  REWARD_RISK_RATIO,
} from '../src/strategies/forecast.js';

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

describe('binary-options expiry (Pocket Option)', () => {
  it('derives an expiry of EXPIRY_BARS bars from the analysed timeframe', () => {
    expect(expiryMinutesFor('1h')).toBe(intervalMinutes('1h') * EXPIRY_BARS);
    expect(expiryMinutesFor('5m')).toBe(5 * EXPIRY_BARS);
    expect(expiryMinutesFor('1d')).toBe(1440 * EXPIRY_BARS);
    // Unknown intervals fall back to one hour.
    expect(expiryMinutesFor('nonsense')).toBe(60 * EXPIRY_BARS);
  });

  it('populates the expiry time for a directional forecast using the given interval', () => {
    const forecast = buildForecast(analytics.analyze(upTrend, 'EURUSD'), { interval: '5m' });
    expect(forecast.direction).toBe('long');
    expect(forecast.expiryMinutes).toBe(expiryMinutesFor('5m'));
  });

  it('defaults the expiry interval to 1h when none is supplied', () => {
    const forecast = buildForecast(analytics.analyze(upTrend, 'EURUSD'));
    expect(forecast.expiryMinutes).toBe(expiryMinutesFor('1h'));
  });

  it('leaves the expiry null when there is no directional signal', () => {
    const forecast = buildForecast(analytics.analyze(series([100, 101, 102]), 'EURUSD'), { interval: '1h' });
    expect(forecast.direction).toBe('');
    expect(forecast.expiryMinutes).toBeNull();
  });
});
