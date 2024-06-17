import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Transaction } from 'src/app/transaction/models/transaction.model';
import { Statement } from 'src/app/statement/models/statement.model';
import { User } from 'src/app/user/models/user.model';
import { Bank } from 'src/app/transaction-mapper/models/bank.enum';

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
