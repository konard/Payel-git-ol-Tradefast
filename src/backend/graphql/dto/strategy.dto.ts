import { Field, ObjectType } from '@nestjs/graphql';

/** A registered trading strategy, exposed for discovery by clients. */
@ObjectType()
export class StrategyDto {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  title!: string;
}
