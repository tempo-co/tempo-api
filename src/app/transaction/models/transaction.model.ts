import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Account } from 'src/app/account/models/account.model';
import { Statement } from 'src/app/statement/models/statement.model';
import { Category } from 'src/category/models/category.model';

@ObjectType()
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

  @Field(() => Statement)
  statement: Statement;

  @Field(() => Category)
  category: Category;
}
