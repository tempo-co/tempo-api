import {Field, Float, ID, ObjectType} from '@nestjs/graphql';
import {Bank} from 'src/app/core/transaction-mapper/models/bank.enum';
import {TypeBankStatement} from '../../bank-statements/graphql/bank-statement.type';
import {TypeTransaction} from '../../transactions/graphql/transaction.type';
import {TypeUser} from '../../users/graphql/user.type';

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
