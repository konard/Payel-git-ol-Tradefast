/** Per-symbol consensus analytics for the latest run, as returned by the API. */
export interface Analytics {
  symbol: string;
  consensusScore: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  strongestStrategy: string | null;
  strongestStrength: number | null;
  lastPrice: number | null;
  atr: number | null;
}

/** The GraphQL selection set shared by queries that embed analytics rows. */
export const ANALYTICS_FIELDS = `
  symbol
  consensusScore
  longCount
  shortCount
  neutralCount
  strongestStrategy
  strongestStrength
  lastPrice
  atr
`;
