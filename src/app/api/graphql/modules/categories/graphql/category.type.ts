import {ObjectType, Field, ID} from '@nestjs/graphql';
//TODO: Add relative paths (@)
import {Transaction} from '../../../../../entities/transaction/transaction.entity';

@ObjectType('Category')
export class TypeCategory {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  description: string;

  @Field(() => [Transaction])
  transactions: Transaction[];
}
