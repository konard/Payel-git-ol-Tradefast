import { Field, Float, ObjectType } from '@nestjs/graphql';

/** A single whole-internet web search hit, returned by the `webSearch` query. */
@ObjectType()
export class SearchResultDto {
  @Field(() => String)
  source!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field(() => String, { nullable: true })
  snippet!: string | null;

  @Field(() => Float)
  score!: number;
}
