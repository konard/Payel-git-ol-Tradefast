/** Prune outdated runs; returns how many runs were removed. */
export const CLEAR_MUTATION = `
  mutation Clear {
    clear
  }
`;

export interface ClearResult {
  clear: number;
}
