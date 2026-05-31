/** Barrel for the frontend GraphQL layer: client, typed documents and repository. */
export { GraphqlClient, GraphqlRequestError, type GraphqlError } from './client.js';
export { GraphqlTradefastRepository } from './repository.js';
export type { Analytics } from './analytics.js';
export type { Status } from './status.js';
export type { Strategy } from './strategy.js';
export type { SymbolRun } from './symbol-run.js';
export type { RunReport } from './run-report.js';
export type { TableCount } from './table-count.js';
