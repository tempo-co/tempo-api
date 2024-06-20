import {Field, ID, ObjectType, GraphQLISODateTime} from '@nestjs/graphql';
import {TypeAccount} from '@modules/accounts/graphql/account.type';

@ObjectType('User')
export class TypeUser {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  isActive: boolean;

  @Field(() => GraphQLISODateTime)
  createdDate: Date;

  @Field(() => [TypeAccount])
  accounts: TypeAccount[];
}
