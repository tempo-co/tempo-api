import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Account } from 'src/app/account/models/account.model';
import { Transaction } from 'src/app/transaction/models/transaction.model';

@ObjectType()
export class Statement {
  @Field(() => ID)
  id: string;

  @Field()
  date: Date;

  @Field()
  file: string;

  @Field(() => Account)
  account: Account;

  @Field(() => [Transaction])
  transactions: Transaction[];
}
