import {ObjectType, Field, ID} from '@nestjs/graphql';
import {Account} from 'src/app/entities/account/account.entity';
import {Transaction} from '../../../../../entities/transaction/transaction.entity';

@ObjectType('BankStatement')
export class TypeBankStatement {
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
