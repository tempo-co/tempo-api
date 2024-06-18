import {ObjectType, Field, ID} from '@nestjs/graphql';
import {TypeTransaction} from '@modules/transactions/graphql/transaction.type';

@ObjectType('Category')
export class TypeCategory {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  description: string;

  @Field(() => [TypeTransaction])
  transactions: TypeTransaction[];
}
