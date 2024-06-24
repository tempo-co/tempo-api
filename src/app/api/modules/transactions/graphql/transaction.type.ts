import {Field, Float, GraphQLISODateTime, ID, ObjectType} from '@nestjs/graphql';

import {Category} from '@core/transaction-categorizer/constants/category.enum';
import {TypeAccount} from '@modules/accounts/graphql/account.type';
import {TypeBankStatement} from '@modules/bank-statements/graphql/bank-statement.type';

@ObjectType('Transaction')
export class TypeTransaction {
  @Field(() => ID)
  id: string;

  @Field(() => GraphQLISODateTime)
  startedDate: Date;

  @Field(() => GraphQLISODateTime)
  completedDate: Date;

  @Field()
  description: string;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => Category)
  category: Category;

  @Field(() => TypeAccount)
  account: TypeAccount;

  @Field(() => TypeBankStatement, {nullable: true})
  bankStatement?: TypeBankStatement | null;
}
