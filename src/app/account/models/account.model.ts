import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Bank } from 'src/app/bank-transaction-adapter/constants/bank';
import { Transaction } from 'src/app/transaction/models/transaction.model';
import { Statement } from 'src/app/statement/models/statement.model';
import { User } from 'src/app/user/models/user.model';

@ObjectType()
export class Account {
  @Field(() => ID)
  id: string;

  @Field()
  alias: string;

  @Field(() => Float)
  balance: number;

  @Field(() => Bank)
  bank: Bank;

  @Field(() => User)
  user: User;

  @Field(() => [Transaction])
  transactions: Transaction[];

  @Field(() => [Statement])
  statements: Statement[];
}
