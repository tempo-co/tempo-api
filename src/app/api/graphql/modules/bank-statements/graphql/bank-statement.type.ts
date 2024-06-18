import {ObjectType, Field, ID} from '@nestjs/graphql';
import {TypeAccount} from '../../accounts/graphql/account.type';
import {TypeTransaction} from '../../transactions/graphql/transaction.type';

@ObjectType('BankStatement')
export class TypeBankStatement {
  @Field(() => ID)
  id: string;

  @Field()
  date: Date;

  @Field()
  file: string;

  @Field(() => TypeAccount)
  account: TypeAccount;

  @Field(() => [TypeTransaction])
  transactions: TypeTransaction[];
}
