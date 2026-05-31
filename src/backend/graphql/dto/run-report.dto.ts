import { Field, Int, ObjectType } from '@nestjs/graphql';

import { SymbolRunDto } from './symbol-run.dto.js';

/** The outcome of a `/start` or `/update` collection run. */
@ObjectType()
export class RunReportDto {
  @Field(() => Int)
  runId!: number;

  @Field(() => String)
  kind!: string;

  @Field(() => [SymbolRunDto])
  symbols!: SymbolRunDto[];

  @Field(() => Int)
  searchResults!: number;

  @Field(() => Int)
  durationMs!: number;
}
