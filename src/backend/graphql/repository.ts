import { Inject, Injectable } from '@nestjs/common';

import type { RunReport } from '../../pipeline/collector.js';
import { RunReportDto } from './dto/run-report.dto.js';
import { StatusDto } from './dto/status.dto.js';
import { StrategyDto } from './dto/strategy.dto.js';
import { TRADEFAST_FACADE, type TradefastApiFacade } from './facade.js';

/**
 * The backend-side repository. It is the single place that talks to the
 * application facade and maps its domain reports into GraphQL DTOs, so the
 * resolver stays a thin declaration of the schema. Mirrors the frontend
 * repository, giving both ends of the `cli → graphql → backend` path one object
 * that owns data access.
 */
@Injectable()
export class TradefastRepository {
  constructor(@Inject(TRADEFAST_FACADE) private readonly tradefast: TradefastApiFacade) {}

  async status(): Promise<StatusDto> {
    const status = await this.tradefast.status();
    return {
      driver: status.driver,
      counts: Object.entries(status.counts).map(([name, count]) => ({ name, count })),
      latestRunId: status.latestRunId ?? null,
      latestAnalytics: status.latestAnalytics.map((row) => ({
        symbol: row.symbol,
        consensusScore: row.consensusScore,
        longCount: row.longCount,
        shortCount: row.shortCount,
        neutralCount: row.neutralCount,
        strongestStrategy: row.strongestStrategy ?? null,
        strongestStrength: row.strongestStrength ?? null,
        lastPrice: row.lastPrice ?? null,
        atr: row.atr ?? null,
      })),
    };
  }

  strategies(): StrategyDto[] {
    return this.tradefast.strategies();
  }

  async start(): Promise<RunReportDto> {
    return toRunDto(await this.tradefast.start());
  }

  async update(): Promise<RunReportDto> {
    return toRunDto(await this.tradefast.update());
  }

  clear(): Promise<number> {
    return this.tradefast.clear();
  }
}

/** Map a pipeline {@link RunReport} into its GraphQL DTO. */
export function toRunDto(report: RunReport): RunReportDto {
  return {
    runId: report.runId,
    kind: report.kind,
    symbols: report.symbols.map((symbol) => ({
      symbol: symbol.symbol,
      candlesAdded: symbol.candlesAdded,
      signalsInserted: symbol.signalsInserted,
      signalsUpdated: symbol.signalsUpdated,
      signalsUnchanged: symbol.signalsUnchanged,
      scrapesAdded: symbol.scrapesAdded,
      insight: symbol.insight,
    })),
    searchResults: report.searchResults,
    durationMs: report.durationMs,
  };
}
