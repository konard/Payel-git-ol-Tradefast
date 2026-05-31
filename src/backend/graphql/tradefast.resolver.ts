import { Inject } from '@nestjs/common';
import { Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { RunReportDto } from './dto/run-report.dto.js';
import { StatusDto } from './dto/status.dto.js';
import { StrategyDto } from './dto/strategy.dto.js';
import { TradefastRepository } from './repository.js';

/**
 * The GraphQL schema surface. Every field delegates to {@link TradefastRepository}
 * so this class stays a thin declaration of queries and mutations.
 */
@Resolver()
export class TradefastResolver {
  constructor(@Inject(TradefastRepository) private readonly repository: TradefastRepository) {}

  @Query(() => StatusDto)
  status(): Promise<StatusDto> {
    return this.repository.status();
  }

  @Query(() => [StrategyDto])
  async strategies(): Promise<StrategyDto[]> {
    return this.repository.strategies();
  }

  @Mutation(() => RunReportDto)
  start(): Promise<RunReportDto> {
    return this.repository.start();
  }

  @Mutation(() => RunReportDto)
  update(): Promise<RunReportDto> {
    return this.repository.update();
  }

  @Mutation(() => Int)
  clear(): Promise<number> {
    return this.repository.clear();
  }
}
