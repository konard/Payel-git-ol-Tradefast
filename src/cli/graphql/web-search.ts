/** A single whole-internet web search hit returned by the backend. */
export interface WebSearchHit {
  source: string;
  title: string;
  url: string | null;
  snippet: string | null;
  score: number;
}

/** Run a whole-internet web search ("Web Search" platform) on the backend. */
export const WEB_SEARCH_QUERY = `
  query WebSearch($query: String!, $limit: Int) {
    webSearch(query: $query, limit: $limit) {
      source
      title
      url
      snippet
      score
    }
  }
`;

export interface WebSearchResult {
  webSearch: WebSearchHit[];
}
