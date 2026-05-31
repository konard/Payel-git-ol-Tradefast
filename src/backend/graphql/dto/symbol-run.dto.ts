import { Field, Int, ObjectType } from '@nestjs/graphql';

/** What a single symbol contributed to a collection run. */
@ObjectType()
export class SymbolRunDto {
  @Field(() => String)
  symbol!: string;

  @Field(() => Int)
  candlesAdded!: number;

  @Field(() => Int)
  signalsInserted!: number;

  @Field(() => Int)
  signalsUpdated!: number;

  @Field(() => Int)
  signalsUnchanged!: number;

  @Field(() => Int)
  scrapesAdded!: number;

  @Field(() => String)
  insight!: string;
}
