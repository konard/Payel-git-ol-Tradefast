import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

/** Per-symbol consensus analytics for the latest run. */
@ObjectType()
export class AnalyticsDto {
  @Field(() => String)
  symbol!: string;

  @Field(() => Float)
  consensusScore!: number;

  @Field(() => Int)
  longCount!: number;

  @Field(() => Int)
  shortCount!: number;

  @Field(() => Int)
  neutralCount!: number;

  @Field(() => String, { nullable: true })
  strongestStrategy!: string | null;

  @Field(() => Float, { nullable: true })
  strongestStrength!: number | null;

  @Field(() => Float, { nullable: true })
  lastPrice!: number | null;

  @Field(() => Float, { nullable: true })
  atr!: number | null;
}
