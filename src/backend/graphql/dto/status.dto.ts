import { Field, Int, ObjectType } from '@nestjs/graphql';

import { AnalyticsDto } from './analytics.dto.js';
import { TableCountDto } from './table-count.dto.js';

/** A snapshot of the backend's database and the latest run's analytics. */
@ObjectType()
export class StatusDto {
  @Field(() => String)
  driver!: string;

  @Field(() => [TableCountDto])
  counts!: TableCountDto[];

  @Field(() => Int, { nullable: true })
  latestRunId!: number | null;

  @Field(() => [AnalyticsDto])
  latestAnalytics!: AnalyticsDto[];
}
