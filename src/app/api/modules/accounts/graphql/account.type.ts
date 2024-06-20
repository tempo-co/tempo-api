import {Field, Float, ID, ObjectType} from '@nestjs/graphql';
import {Bank} from '@core/transaction-mapper/constants/bank.enum';
import {TypeUser} from '@modules/users/graphql/user.type';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';
import {TypeBankStatement} from '@modules/bank-statements/graphql/bank-statement.type';

@ObjectType('Account')
export class TypeAccount {
  @Field(() => ID)
  id: string;

  @Field()
  alias: string;

  @Field(() => Float)
  balance: number;

  @Field(() => Bank)
  bank: Bank;

  @Field(() => TypeUser)
  user: TypeUser;

  @Field(() => [TypeTransaction])
  transactions: TypeTransaction[];

  @Field(() => [TypeBankStatement])
  bankStatements: TypeBankStatement[];
}
