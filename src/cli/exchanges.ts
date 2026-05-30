/**
 * The kind of trading venue an exchange represents.
 *
 *  - `spot` venues (Binance, Bybit, …) settle a position at a price: trades are
 *    bracketed with a take-profit and a stop-loss.
 *  - `binary-options` venues (Pocket Option) have no take-profit or stop-loss at
 *    all — a trade is simply a directional bet that resolves after a fixed
 *    **expiry time**. For those venues the Trade Log shows an expiry *time*
 *    instead of TP/SL levels.
 */
export type ExchangeKind = 'spot' | 'binary-options';

export interface ExchangeInfo {
  name: string;
  label: string;
  /** Whether the venue settles on price (spot) or on a timed expiry (binary options). */
  kind: ExchangeKind;
}

const EXCHANGES = {
  binance: { name: 'binance', label: 'Binance', kind: 'spot' },
  okx: { name: 'okx', label: 'OKX', kind: 'spot' },
  bybit: { name: 'bybit', label: 'Bybit', kind: 'spot' },
  mexc: { name: 'mexc', label: 'MEXC', kind: 'spot' },
  pocketoption: { name: 'pocketoption', label: 'Pocket Option', kind: 'binary-options' },
} satisfies Record<string, ExchangeInfo>;

export type ExchangeName = keyof typeof EXCHANGES;

export const DEFAULT_EXCHANGE: ExchangeName = 'bybit';

export const exchangeNames = (): ExchangeName[] => Object.keys(EXCHANGES) as ExchangeName[];

export function getExchange(name?: string): ExchangeInfo {
  const normalized = normalizeExchange(name);
  return EXCHANGES[normalized] ?? EXCHANGES[DEFAULT_EXCHANGE];
}

/** Normalise loose user input (`pocket-option`, `Pocket Option`, …) to a key. */
function normalizeExchange(name?: string): ExchangeName {
  const raw = (name ?? DEFAULT_EXCHANGE).toLowerCase().replace(/[\s_-]+/g, '');
  return raw as ExchangeName;
}

/** True when `name` resolves to a known exchange (accepts loose spellings). */
export function isKnownExchange(name?: string): boolean {
  return normalizeExchange(name) in EXCHANGES;
}

/** The venue kind for an exchange name, defaulting to `spot` for unknown names. */
export function exchangeKind(name?: string): ExchangeKind {
  return getExchange(name).kind;
}

/** True when the venue resolves trades on a timed expiry rather than TP/SL. */
export function isBinaryOptions(name?: string): boolean {
  return exchangeKind(name) === 'binary-options';
}
