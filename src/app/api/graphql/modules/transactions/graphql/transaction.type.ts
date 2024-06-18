import {Field, Float, ID, ObjectType} from '@nestjs/graphql';
import {Account} from 'src/app/entities/account/account.entity';
import {TypeCategory} from '../../categories/graphql/category.type';
import {TypeBankStatement} from '../../bank-statements/graphql/bank-statement.type';

@ObjectType('Transaction')
export class Transaction {
  @Field(() => ID)
  id: string;

  @Field()
  startedDate: Date;

  @Field()
  completedDate: Date;

  @Field()
  description: string;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => Account)
  account: Account;

  @Field(() => TypeBankStatement)
  bankStatement: TypeBankStatement;

  @Field(() => TypeCategory)
  category: TypeCategory;
}
