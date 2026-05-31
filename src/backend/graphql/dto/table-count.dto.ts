import { Field, Int, ObjectType } from '@nestjs/graphql';

/** A single database table together with its current row count. */
@ObjectType()
export class TableCountDto {
  @Field(() => String)
  name!: string;

  @Field(() => Int)
  count!: number;
}
