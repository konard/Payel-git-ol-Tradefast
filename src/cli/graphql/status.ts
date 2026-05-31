import { ANALYTICS_FIELDS, type Analytics } from './analytics.js';
import type { TableCount } from './table-count.js';

/** A snapshot of the backend's database and the latest run's analytics. */
export interface Status {
  driver: string;
  counts: TableCount[];
  latestRunId: number | null;
  latestAnalytics: Analytics[];
}

/** Query the backend status, including the latest run's analytics. */
export const STATUS_QUERY = `
  query Status {
    status {
      driver
      latestRunId
      counts {
        name
        count
      }
      latestAnalytics {${ANALYTICS_FIELDS}}
    }
  }
`;

export interface StatusResult {
  status: Status;
}
