import type { Candle } from '../domain/candle.js';
import { DEFAULT_PARAMETERS, type StrategyParameters } from '../domain/signal.js';
import { buildForecast, EXPIRY_BARS } from '../strategies/forecast.js';
import { AnalyticsService } from './analytics.js';

/**
 * Payout per unit staked on a winning binary-options trade (Pocket Option-style,
 * ~92%). A loss costs the full stake (−1). Used only by the binary-options
 * backtest path, where a trade settles purely on its expiry instead of on a
 * take-profit / stop-loss bracket.
 */
export const BINARY_PAYOUT = 0.92;

/**
 * Walk-forward backtester — the honest answer to "is the system accurate?".
 *
 * For every evaluable bar it rebuilds the exact forecast a user would see
 * ({@link buildForecast} over the candles known up to that point), then replays
 * the *future* bars to decide whether the take-profit or the stop-loss was hit
 * first. Aggregated over history this yields a win rate, expectancy and profit
 * factor, so the forecasts can be validated against real price action instead of
 * trusted blindly.
 *
 * The simulation never looks ahead: a forecast made on the close of bar `i` is
 * resolved only against bars `> i`. Trades are non-overlapping (the next entry
 * is considered only after the previous trade closes), and when a single bar
 * straddles both levels the stop is assumed to fill first — the conservative
 * assumption that keeps the reported edge from being flattering.
 */

export interface BacktestOptions {
  /** Bars of warm-up history kept before the first forecast. Default 60. */
  warmup?: number;
  /** Maximum bars to wait for TP/SL before closing at market (timeout). Default 48. */
  horizon?: number;
  params?: StrategyParameters;
  accountBalance?: number;
  /**
   * Settle trades as binary options — held for a fixed expiry then scored by
   * direction — instead of bracketing them with a take-profit / stop-loss. Used
   * for Pocket Option, which has no TP/SL, only an expiry time.
   */
  binary?: boolean;
  /** Bars a binary-options trade is held before it expires. Default {@link EXPIRY_BARS}. */
  expiryBars?: number;
}

export type TradeOutcome = 'tp' | 'sl' | 'timeout';

export interface BacktestTrade {
  /** Index of the candle whose close triggered the forecast (the entry bar). */
  entryIndex: number;
  direction: 'long' | 'short';
  entry: number;
  tp: number;
  sl: number;
  outcome: TradeOutcome;
  /** Index of the candle that closed the trade. */
  exitIndex: number;
  exitPrice: number;
  /** Bars between entry and exit. */
  barsHeld: number;
  /** Realised profit in multiples of the risked stop distance (R). */
  rMultiple: number;
}

export interface BacktestResult {
  symbol: string;
  candles: number;
  trades: number;
  wins: number;
  losses: number;
  timeouts: number;
  /** Wins / decided trades (TP or SL). 0 when there are no decided trades. */
  winRate: number;
  /** Mean R per trade — the expectancy of the system. */
  expectancy: number;
  /** Sum of every trade's R-multiple (total realised R). */
  totalR: number;
  /** Gross winning R / gross losing R; Infinity when there are no losing R. */
  profitFactor: number;
  outcomes: BacktestTrade[];
}

function settle(
  trade: Omit<BacktestTrade, 'barsHeld' | 'rMultiple'> & { stopDistance: number },
): BacktestTrade {
  const { stopDistance, ...rest } = trade;
  const direction = rest.direction;
  const move = direction === 'long' ? rest.exitPrice - rest.entry : rest.entry - rest.exitPrice;
  return {
    ...rest,
    barsHeld: rest.exitIndex - rest.entryIndex,
    rMultiple: stopDistance > 0 ? move / stopDistance : 0,
  };
}

/** Replay future bars after `entryIndex` until TP, SL or the horizon is reached. */
export function simulateTrade(
  candles: readonly Candle[],
  entryIndex: number,
  forecast: { direction: 'long' | 'short'; entry: number; tp: number; sl: number; stopDistance: number },
  horizon: number,
): BacktestTrade {
  const { direction, entry, tp, sl, stopDistance } = forecast;
  const lastIndex = Math.min(entryIndex + horizon, candles.length - 1);

  for (let j = entryIndex + 1; j <= lastIndex; j++) {
    const bar = candles[j];
    const stopHit = direction === 'long' ? bar.low <= sl : bar.high >= sl;
    const targetHit = direction === 'long' ? bar.high >= tp : bar.low <= tp;

    // Conservative tie-break: if one bar spans both levels, the stop fills first.
    if (stopHit) {
      return settle({ entryIndex, direction, entry, tp, sl, outcome: 'sl', exitIndex: j, exitPrice: sl, stopDistance });
    }
    if (targetHit) {
      return settle({ entryIndex, direction, entry, tp, sl, outcome: 'tp', exitIndex: j, exitPrice: tp, stopDistance });
    }
  }

  // Neither level reached within the horizon: mark to market at the last close.
  return settle({
    entryIndex,
    direction,
    entry,
    tp,
    sl,
    outcome: 'timeout',
    exitIndex: lastIndex,
    exitPrice: candles[lastIndex].close,
    stopDistance,
  });
}

/**
 * Settle a binary-options trade. The position is held for exactly `expiryBars`
 * bars and then scored purely on direction: a win if price closed beyond the
 * entry in the predicted direction, a loss if it closed against it. There are no
 * TP/SL levels — the outcome maps onto `tp` (win) / `sl` (loss) / `timeout`
 * (price closed exactly at entry, a push) so it rolls up with the spot metrics.
 * A win pays `payout` R, a loss costs the full 1R stake.
 */
export function simulateBinaryTrade(
  candles: readonly Candle[],
  entryIndex: number,
  forecast: { direction: 'long' | 'short'; entry: number },
  expiryBars: number,
  payout = BINARY_PAYOUT,
): BacktestTrade {
  const { direction, entry } = forecast;
  const exitIndex = Math.min(entryIndex + Math.max(1, expiryBars), candles.length - 1);
  const exitPrice = candles[exitIndex].close;
  const move = direction === 'long' ? exitPrice - entry : entry - exitPrice;
  const outcome: TradeOutcome = move > 0 ? 'tp' : move < 0 ? 'sl' : 'timeout';
  return {
    entryIndex,
    direction,
    entry,
    // No bracket levels on a binary option — surface the entry as a placeholder.
    tp: entry,
    sl: entry,
    outcome,
    exitIndex,
    exitPrice,
    barsHeld: exitIndex - entryIndex,
    rMultiple: outcome === 'tp' ? payout : outcome === 'sl' ? -1 : 0,
  };
}

function summarise(symbol: string, candleCount: number, trades: BacktestTrade[]): BacktestResult {
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let totalR = 0;
  let grossWin = 0;
  let grossLoss = 0;

  for (const trade of trades) {
    totalR += trade.rMultiple;
    if (trade.outcome === 'tp') wins++;
    else if (trade.outcome === 'sl') losses++;
    else timeouts++;
    if (trade.rMultiple >= 0) grossWin += trade.rMultiple;
    else grossLoss += -trade.rMultiple;
  }

  const decided = wins + losses;
  return {
    symbol,
    candles: candleCount,
    trades: trades.length,
    wins,
    losses,
    timeouts,
    winRate: decided > 0 ? wins / decided : 0,
    expectancy: trades.length > 0 ? totalR / trades.length : 0,
    totalR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    outcomes: trades,
  };
}

/**
 * Backtest one symbol over a candle series. Returns aggregate accuracy metrics
 * plus the individual simulated trades. A series with too few candles (or no
 * actionable forecasts) yields a result with zero trades rather than throwing.
 */
export function backtestSymbol(
  candles: readonly Candle[],
  symbol: string,
  options: BacktestOptions = {},
): BacktestResult {
  const warmup = Math.max(2, options.warmup ?? 60);
  const horizon = Math.max(1, options.horizon ?? 48);
  const params = options.params ?? DEFAULT_PARAMETERS;
  const accountBalance = options.accountBalance ?? 10_000;
  const binary = options.binary === true;
  const expiryBars = Math.max(1, options.expiryBars ?? EXPIRY_BARS);
  const analytics = new AnalyticsService();

  const trades: BacktestTrade[] = [];
  let i = warmup;
  while (i < candles.length - 1) {
    const known = candles.slice(0, i + 1);
    const forecast = buildForecast(analytics.analyze(known, symbol, params, accountBalance));
    const directional = forecast.direction === 'long' || forecast.direction === 'short';

    if (binary) {
      // Binary options need only a direction and an entry — they settle on time.
      if (!directional || forecast.entry == null) {
        i += 1;
        continue;
      }
      const trade = simulateBinaryTrade(
        candles,
        i,
        { direction: forecast.direction as 'long' | 'short', entry: forecast.entry as number },
        expiryBars,
      );
      trades.push(trade);
      i = trade.exitIndex + 1;
      continue;
    }

    const actionable =
      directional &&
      forecast.entry != null &&
      forecast.tp != null &&
      forecast.sl != null &&
      forecast.stopDistance != null &&
      forecast.stopDistance > 0;

    if (!actionable) {
      i += 1;
      continue;
    }

    const trade = simulateTrade(
      candles,
      i,
      {
        direction: forecast.direction as 'long' | 'short',
        entry: forecast.entry as number,
        tp: forecast.tp as number,
        sl: forecast.sl as number,
        stopDistance: forecast.stopDistance as number,
      },
      horizon,
    );
    trades.push(trade);
    // Non-overlapping: the next candidate entry is the bar after this trade closes.
    i = trade.exitIndex + 1;
  }

  return summarise(symbol, candles.length, trades);
}

export interface BacktestReport {
  results: BacktestResult[];
  /** Portfolio-level rollup across every symbol. */
  totals: {
    symbols: number;
    trades: number;
    wins: number;
    losses: number;
    timeouts: number;
    winRate: number;
    expectancy: number;
    totalR: number;
    profitFactor: number;
  };
}

/** Roll up per-symbol results into a single portfolio summary. */
export function aggregateBacktests(results: BacktestResult[]): BacktestReport {
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let totalR = 0;
  let grossWin = 0;
  let grossLoss = 0;

  for (const result of results) {
    trades += result.trades;
    wins += result.wins;
    losses += result.losses;
    timeouts += result.timeouts;
    totalR += result.totalR;
    for (const trade of result.outcomes) {
      if (trade.rMultiple >= 0) grossWin += trade.rMultiple;
      else grossLoss += -trade.rMultiple;
    }
  }

  const decided = wins + losses;
  return {
    results,
    totals: {
      symbols: results.length,
      trades,
      wins,
      losses,
      timeouts,
      winRate: decided > 0 ? wins / decided : 0,
      expectancy: trades > 0 ? totalR / trades : 0,
      totalR,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    },
  };
}
