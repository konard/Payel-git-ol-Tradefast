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

/**
 * All enabled news source IDs from the enabled platforms. Non-group platforms
 * (e.g. `web-search`) contribute no curated source IDs and are simply ignored
 * here — they are fulfilled by their own provider, not the news crawler.
 */
export function resolveSourceIds(
  enabledGroups: readonly string[],
): string[] {
  return SOURCE_GROUPS
    .filter((g) => enabledGroups.includes(g.id))
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

/**
 * The identifier of the whole-internet web search. It is intentionally NOT a
 * {@link SourceGroup}: it has no curated `sourceIds` and is fulfilled by the
 * Playwright/HTTP {@link WebSearchProvider} rather than the news crawler. Keeping
 * it separate preserves the strict news-group contract while still letting the
 * selector and config treat it as one more toggleable platform.
 */
export const WEB_SEARCH_PLATFORM_ID = 'web-search' as const;

/** A research platform shown in `/serching-platforms`: a news group or web search. */
export type ResearchPlatformId = SourceGroupId | typeof WEB_SEARCH_PLATFORM_ID;

const WEB_SEARCH_PLATFORM = {
  id: WEB_SEARCH_PLATFORM_ID,
  label: 'Web Search',
  description: 'Search the entire Internet (Google via Playwright, DuckDuckGo HTML fallback)',
} as const;

/** Every platform the selector offers: the news groups followed by web search. */
export const selectablePlatformIds = (): ResearchPlatformId[] => [
  ...sourceGroupIds(),
  WEB_SEARCH_PLATFORM_ID,
];

/** The display label for any platform id (news group or web search). */
export function getPlatformLabel(id: ResearchPlatformId): string {
  if (id === WEB_SEARCH_PLATFORM_ID) return WEB_SEARCH_PLATFORM.label;
  return getSourceGroup(id)?.label ?? id;
}

/** The description line for any platform id (news group or web search). */
export function getPlatformDescription(id: ResearchPlatformId): string {
  if (id === WEB_SEARCH_PLATFORM_ID) return WEB_SEARCH_PLATFORM.description;
  return getSourceGroup(id)?.description ?? '';
}

/** Whether whole-internet web search is among the enabled platforms. */
export function isWebSearchEnabled(platforms: readonly string[]): boolean {
  return platforms.includes(WEB_SEARCH_PLATFORM_ID);
}

/** Default-enabled platforms: every news group plus whole-internet web search. */
export const DEFAULT_ENABLED_PLATFORMS: ResearchPlatformId[] = [
  ...DEFAULT_ENABLED_GROUPS,
  WEB_SEARCH_PLATFORM_ID,
];
