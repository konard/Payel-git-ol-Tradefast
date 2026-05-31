/** Runtime configuration, resolved from environment variables with sane defaults. */
export interface TradefastConfig {
  symbols: string[];
  interval: string;
  candleLimit: number;
  accountBalance: number;
  model: string;
  theme: string;
  exchange: string;
  mode: string;
  searchingLevel: string;
  searchingPlatforms: string[];
  apiEnabled: boolean;
  apiHost: string;
  apiPort: number;
}

export const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'BNBUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'LTCUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'SUIUSDT',
  'TONUSDT', 'PEPEUSDT', 'TRXUSDT', 'ATOMUSDT', 'FILUSDT',
  'HBARUSDT', 'ALGOUSDT', 'VETUSDT', 'XLMUSDT', 'ETCUSDT',
  'AAVEUSDT', 'ICPUSDT', 'INJUSDT', 'RUNEUSDT', 'OPUSDT',
  'FETUSDT', 'KASUSDT',
];

/**
 * Pocket Option is a forex binary-options venue, so it trades currency pairs
 * (Frankfurter / ECB reference rates) rather than crypto tickers. These majors
 * are used as defaults whenever Pocket Option is the selected exchange and the
 * user has not pinned their own `TRADEFAST_SYMBOLS`.
 */
export const FOREX_DEFAULT_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF',
  'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY',
];

/** True when `exchange` names the Pocket Option binary-options venue. */
function isPocketOption(exchange?: string): boolean {
  return (exchange ?? '').toLowerCase().replace(/[\s_-]+/g, '') === 'pocketoption';
}

/** The default symbol universe for an exchange: forex for Pocket Option, crypto otherwise. */
export function defaultSymbolsForExchange(exchange?: string): string[] {
  return isPocketOption(exchange) ? [...FOREX_DEFAULT_SYMBOLS] : [...DEFAULT_SYMBOLS];
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

export function loadConfig(overrides: Partial<TradefastConfig> = {}): TradefastConfig {
  const symbols = (process.env.TRADEFAST_SYMBOLS ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const exchange = overrides.exchange ?? process.env.TRADEFAST_EXCHANGE ?? 'bybit';

  return {
    symbols: overrides.symbols ?? (symbols.length > 0 ? symbols : defaultSymbolsForExchange(exchange)),
    interval: overrides.interval ?? process.env.TRADEFAST_INTERVAL ?? '1h',
    candleLimit: overrides.candleLimit ?? Number(process.env.TRADEFAST_CANDLE_LIMIT ?? 200),
    accountBalance: overrides.accountBalance ?? Number(process.env.TRADEFAST_ACCOUNT_BALANCE ?? 10_000),
    model: overrides.model ?? process.env.TRADEFAST_AI_MODEL ?? 'claude-opus-4-7',
    theme: overrides.theme ?? process.env.TRADEFAST_THEME ?? 'violet',
    exchange: overrides.exchange ?? process.env.TRADEFAST_EXCHANGE ?? 'bybit',
    mode: overrides.mode ?? process.env.TRADEFAST_MODE ?? 'medium-term',
    searchingLevel: overrides.searchingLevel ?? process.env.TRADEFAST_SEARCHING_LEVEL ?? 'normal',
    searchingPlatforms: overrides.searchingPlatforms ?? (
      process.env.TRADEFAST_SEARCHING_PLATFORMS
        ? process.env.TRADEFAST_SEARCHING_PLATFORMS.split(',').map(s => s.trim()).filter(Boolean)
        : ['economic-calendars', 'news-portals', 'reddit-communities', 'exchange-communities', 'web-search']
    ),
    apiEnabled: overrides.apiEnabled ?? envFlag('TRADEFAST_API', true),
    apiHost: overrides.apiHost ?? process.env.TRADEFAST_API_HOST ?? '127.0.0.1',
    apiPort: overrides.apiPort ?? Number(process.env.TRADEFAST_API_PORT ?? 0),
  };
}
