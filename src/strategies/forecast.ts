import type { SymbolAnalysis } from '../services/analytics.js';

/**
 * Reward-to-risk ratio applied to every forecast: the take-profit sits this
 * many times the stop distance away from entry, while the stop is exactly one
 * stop distance away. A 2:1 ratio means a winning trade earns +2R and a losing
 * trade costs −1R.
 */
export const REWARD_RISK_RATIO = 2;

/**
 * How many candles of the analysed timeframe a binary-options position is held
 * before it expires. Binary-options venues (Pocket Option) have no take-profit
 * or stop-loss — a trade is a directional bet that settles purely on time — so
 * the expiry is derived from the timeframe: it gives the predicted move roughly
 * the same number of bars the {@link REWARD_RISK_RATIO}:1 target would need to
 * play out on a spot venue.
 */
export const EXPIRY_BARS = REWARD_RISK_RATIO;

/** Minutes in each supported analysis interval. */
const INTERVAL_MINUTES: Record<string, number> = {
  '1m': 1, '5m': 5, '10m': 10, '15m': 15, '20m': 20, '30m': 30, '1h': 60, '4h': 240, '1d': 1440,
};

/** Resolve an interval string to its duration in minutes (defaults to 1h). */
export function intervalMinutes(interval: string): number {
  return INTERVAL_MINUTES[interval] ?? 60;
}

/** Binary-options expiry (in minutes) for a given analysis timeframe. */
export function expiryMinutesFor(interval: string): number {
  return intervalMinutes(interval) * EXPIRY_BARS;
}

/** Options that tune how a forecast is derived. */
export interface ForecastOptions {
  /** The analysed timeframe; drives the binary-options expiry time. */
  interval?: string;
}

/**
 * The concrete trade Tradefast suggests for a symbol: a direction, an entry, and
 * — depending on the venue — both the bracket levels (take-profit and
 * stop-loss) and a binary-options expiry time. `direction` is the empty string
 * when no risk-approved directional signal exists, in which case the bracket
 * levels and expiry are null.
 */
export interface Forecast {
  symbol: string;
  direction: 'long' | 'short' | '';
  /** Suggested entry price — the latest close. */
  entry: number | null;
  /** Take-profit target (2R away from entry). Used by spot venues. */
  tp: number | null;
  /** Stop-loss level (1R away from entry). Used by spot venues. */
  sl: number | null;
  /** Distance from entry to the stop — the 1R risk unit. */
  stopDistance: number | null;
  /**
   * Binary-options expiry, in minutes: how long to hold the directional bet
   * before it settles. Populated whenever there is a directional signal — this
   * is what Pocket Option uses *instead* of TP/SL.
   */
  expiryMinutes: number | null;
}

function isFinitePrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Derives the trade the system recommends from a symbol analysis.
 *
 * It picks the strongest risk-approved directional signal, anchors the entry at
 * the latest price and brackets it with an ATR-derived stop (one stop distance
 * away) and a {@link REWARD_RISK_RATIO}:1 take-profit. The same directional
 * signal also yields a binary-options expiry time ({@link expiryMinutesFor}) for
 * venues that settle on time instead of price. This is the single source of
 * truth shared by the Trade Log table and the backtester, so what users see on
 * screen is exactly what gets validated against history.
 */
export function buildForecast(analysis: SymbolAnalysis, options: ForecastOptions = {}): Forecast {
  const entry = analysis.analytics.lastPrice;
  const candidates = analysis.evaluated
    .filter((item) => item.position && (item.signal.direction === 'long' || item.signal.direction === 'short'))
    .sort((a, b) => {
      const approvedDelta = Number(b.risk?.approved === true) - Number(a.risk?.approved === true);
      return approvedDelta !== 0 ? approvedDelta : b.signal.strength - a.signal.strength;
    });

  const selected = candidates[0];
  const direction =
    selected?.signal.direction === 'long' || selected?.signal.direction === 'short' ? selected.signal.direction : '';
  const stopDistance = selected?.position?.stopDistance;

  // A directional signal carries an expiry time regardless of whether a spot
  // stop distance could be computed — binary options only need the direction.
  const expiryMinutes = direction === '' ? null : expiryMinutesFor(options.interval ?? '1h');

  if (!isFinitePrice(entry) || !isFinitePrice(stopDistance)) {
    return {
      symbol: analysis.symbol,
      direction,
      tp: null,
      sl: null,
      entry: isFinitePrice(entry) ? entry : null,
      stopDistance: null,
      expiryMinutes,
    };
  }

  if (direction === 'short') {
    return {
      symbol: analysis.symbol,
      direction,
      tp: entry - stopDistance * REWARD_RISK_RATIO,
      sl: entry + stopDistance,
      entry,
      stopDistance,
      expiryMinutes,
    };
  }

  return {
    symbol: analysis.symbol,
    direction,
    tp: entry + stopDistance * REWARD_RISK_RATIO,
    sl: entry - stopDistance,
    entry,
    stopDistance,
    expiryMinutes,
  };
}
