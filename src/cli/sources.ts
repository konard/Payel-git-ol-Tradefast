export interface SourceGroup {
  id: string;
  label: string;
  description: string;
  sourceIds: string[];
}

export type SourceGroupId =
  | 'economic-calendars'
  | 'news-portals'
  | 'crypto-news'
  | 'reddit-communities'
  | 'crypto-communities'
  | 'exchange-communities';

const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: 'economic-calendars',
    label: 'Economic Calendars',
    description: 'Investing.com, TradingView, Alfa-Forex, Forex Club, Forex Factory, DailyFX, Myfxbook',
    sourceIds: [
      'investing-economic-calendar',
      'tradingview-economic-calendar',
      'alfaforex-economic-calendar',
      'fxclub-economic-calendar',
      'forexfactory-economic-calendar',
      'dailyfx-economic-calendar',
      'myfxbook-economic-calendar',
    ],
  },
  {
    id: 'news-portals',
    label: 'News Portals',
    description:
      'TradingView News, Investing.com, RBC, Kommersant, Mail.ru, LiteFinance, Euronews, TradingView Markets, CNBC, Reuters, MarketWatch, Yahoo Finance',
    sourceIds: [
      'tradingview-news',
      'investing-news',
      'rbc-finances',
      'kommersant-finance-theme',
      'mail-economics',
      'litefinance-forex-news',
      'euronews-markets',
      'tradingview-markets',
      'cnbc-markets',
      'reuters-markets',
      'marketwatch-markets',
      'yahoo-finance',
    ],
  },
  {
    id: 'crypto-news',
    label: 'Crypto News',
    description: 'CoinDesk, Cointelegraph, The Block, Decrypt, CryptoSlate, Bitcoin Magazine, CoinGecko News, CoinMarketCap Headlines',
    sourceIds: [
      'coindesk-news',
      'cointelegraph-news',
      'theblock-news',
      'decrypt-news',
      'cryptoslate-news',
      'bitcoinmagazine-news',
      'coingecko-news',
      'coinmarketcap-headlines',
    ],
  },
  {
    id: 'reddit-communities',
    label: 'Reddit Communities',
    description: 'r/economy, r/Finance, r/stocks, r/investing, r/wallstreetbets, r/StockMarket, r/Forex, r/CryptoCurrency, r/econ, r/FinancialNews',
    sourceIds: [
      'reddit-economy',
      'reddit-finance',
      'reddit-stocks',
      'reddit-investing',
      'reddit-wallstreetbets',
      'reddit-stockmarket',
      'reddit-forex',
      'reddit-cryptocurrency',
      'reddit-econ',
      'reddit-financialnews',
    ],
  },
  {
    id: 'crypto-communities',
    label: 'Crypto Communities',
    description: 'r/Bitcoin, r/ethereum, r/CryptoMarkets, r/defi, r/Altcoin, r/CryptoTechnology',
    sourceIds: [
      'reddit-bitcoin',
      'reddit-ethereum',
      'reddit-cryptomarkets',
      'reddit-defi',
      'reddit-altcoin',
      'reddit-cryptotechnology',
    ],
  },
  {
    id: 'exchange-communities',
    label: 'Exchange Communities',
    description: 'Binance blog + Reddit, Bybit blog + Reddit, OKX Learn + Reddit, MEXC blog + Reddit',
    sourceIds: [
      'binance-blog',
      'binance-reddit',
      'bybit-blog',
      'bybit-reddit',
      'okx-learn',
      'okx-reddit',
      'mexc-blog',
      'mexc-reddit',
    ],
  },
];

export const sourceGroupIds = (): SourceGroupId[] =>
  SOURCE_GROUPS.map((g) => g.id as SourceGroupId);

export function getSourceGroup(id: string): SourceGroup | undefined {
  return SOURCE_GROUPS.find((g) => g.id === id);
}

/** All enabled source IDs from the enabled group IDs. */
export function resolveSourceIds(
  enabledGroups: SourceGroupId[],
): string[] {
  return SOURCE_GROUPS
    .filter((g) => enabledGroups.includes(g.id as SourceGroupId))
    .flatMap((g) => g.sourceIds);
}

/** Default: all groups enabled. */
export const DEFAULT_ENABLED_GROUPS: SourceGroupId[] = [
  'economic-calendars',
  'news-portals',
  'crypto-news',
  'reddit-communities',
  'crypto-communities',
  'exchange-communities',
];
