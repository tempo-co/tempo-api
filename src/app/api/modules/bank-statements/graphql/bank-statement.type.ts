import {Field, ID, ObjectType} from '@nestjs/graphql';

import {TypeAccount} from '@modules/accounts/graphql/account.type';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';

@ObjectType('BankStatement')
export class TypeBankStatement {
  @Field(() => ID)
  id: string;

  // TODO: Figure out how to send file back to client
  // @Field()
  // file: Buffer;

  @Field(() => TypeAccount)
  account: TypeAccount;

  @Field(() => [TypeTransaction])
  transactions: TypeTransaction[];
}
