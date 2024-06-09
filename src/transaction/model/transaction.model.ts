import { Field, Float, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Transaction {
  @Field(() => ID)
  id: string;

  @Field()
  startedDate: Date;

  @Field()
  completedDate: Date;

  @Field(() => Float)
  startBalance: number;

  @Field(() => Float)
  endBalance: number;

  @Field()
  description: string;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;
}
