import { SYMBOL_RUN_FIELDS, type SymbolRun } from './symbol-run.js';

/** The outcome of a `/start` or `/update` collection run. */
export interface RunReport {
  runId: number;
  kind: string;
  symbols: SymbolRun[];
  searchResults: number;
  durationMs: number;
}

/** The GraphQL selection set shared by the start/update mutations. */
const RUN_REPORT_FIELDS = `
  runId
  kind
  searchResults
  durationMs
  symbols {${SYMBOL_RUN_FIELDS}}
`;

/** Clear prior run data and analyse afresh. */
export const START_MUTATION = `
  mutation Start {
    start {${RUN_REPORT_FIELDS}}
  }
`;

/** Re-analyse, writing only rows that actually changed. */
export const UPDATE_MUTATION = `
  mutation Update {
    update {${RUN_REPORT_FIELDS}}
  }
`;

export interface StartResult {
  start: RunReport;
}

export interface UpdateResult {
  update: RunReport;
}
