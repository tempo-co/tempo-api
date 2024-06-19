import {Field, Float, ID, ObjectType} from '@nestjs/graphql';
import {TypeCategory} from '@modules/categories/graphql/category.type';
import {TypeBankStatement} from '@modules/bank-statements/graphql/bank-statement.type';
import {TypeAccount} from '@modules/accounts/graphql/account.type';

@ObjectType('Transaction')
export class TypeTransaction {
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

  @Field(() => TypeAccount)
  account: TypeAccount;

  @Field(() => TypeBankStatement)
  bankStatement: TypeBankStatement;

  @Field(() => TypeCategory)
  category: TypeCategory;
}
