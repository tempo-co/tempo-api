import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Transaction } from 'src/app/transaction/models/transaction.model';

@ObjectType()
export class Category {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  description: string;

  @Field(() => [Transaction])
  transactions: Transaction[];
}
