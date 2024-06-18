import {Field, Float, ID, ObjectType} from '@nestjs/graphql';
import {Transaction} from '../../../../../entities/transaction/transaction.entity';
import {BankStatement} from '../../../../../entities/bank-statement/statement.entity';
import {User} from 'src/app/entities/user/user.entity';
import {Bank} from 'src/app/core/transaction-mapper/models/bank.enum';

@ObjectType()
export class TypeAccount {
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

  @Field(() => [BankStatement])
  bankStatements: BankStatement[];
}
