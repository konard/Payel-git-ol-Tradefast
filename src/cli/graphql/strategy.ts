/** A registered trading strategy advertised by the backend. */
export interface Strategy {
  id: string;
  title: string;
}

/** Query the registry of available strategies. */
export const STRATEGIES_QUERY = `
  query Strategies {
    strategies {
      id
      title
    }
  }
`;

export interface StrategiesResult {
  strategies: Strategy[];
}
