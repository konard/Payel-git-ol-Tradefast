/** What a single symbol contributed to a collection run. */
export interface SymbolRun {
  symbol: string;
  candlesAdded: number;
  signalsInserted: number;
  signalsUpdated: number;
  signalsUnchanged: number;
  scrapesAdded: number;
  insight: string;
}

/** The GraphQL selection set for a symbol's run contribution. */
export const SYMBOL_RUN_FIELDS = `
  symbol
  candlesAdded
  signalsInserted
  signalsUpdated
  signalsUnchanged
  scrapesAdded
  insight
`;
