import 'reflect-metadata';
import { Inject } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { RunReportDto } from './dto/run-report.dto.js';
import { SearchResultDto } from './dto/search-result.dto.js';
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

  /** Whole-internet web search ("Web Search" platform), executed server-side. */
  @Query(() => [SearchResultDto])
  webSearch(
    @Args('query', { type: () => String }) query: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<SearchResultDto[]> {
    return this.repository.webSearch(query, limit ?? undefined);
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

// The build pipeline (esbuild via tsup/vitest) cannot emit `design:paramtypes`,
// which `@Args()` reflects at schema-build time. Every other field passes an
// explicit `@Field(() => …)` thunk and so never needs it, but `@Args()` reads
// the reflected parameter list *before* honouring its explicit `type` option and
// would otherwise crash on `undefined[index]`. Declaring the metadata by hand —
// exactly what `emitDecoratorMetadata` would generate — keeps the schema build
// reflection-free while preserving the explicit `() => String` / `() => Int` types.
Reflect.defineMetadata('design:paramtypes', [String, Number], TradefastResolver.prototype, 'webSearch');
