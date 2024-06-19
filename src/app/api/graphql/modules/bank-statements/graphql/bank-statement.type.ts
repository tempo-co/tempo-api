import {ObjectType, Field, ID} from '@nestjs/graphql';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';
import {TypeAccount} from '@modules/accounts/graphql/account.type';

@ObjectType('BankStatement')
export class TypeBankStatement {
  @Field(() => ID)
  id: string;

  @Field()
  file: Buffer;

  @Field(() => TypeAccount)
  account: TypeAccount;

  @Field(() => [TypeTransaction])
  transactions: TypeTransaction[];
}
