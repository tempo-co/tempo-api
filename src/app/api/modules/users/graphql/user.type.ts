import {Field, ID, ObjectType} from '@nestjs/graphql';

import {TypeAccount} from '@modules/accounts/graphql/account.type';

@ObjectType('User')
export class TypeUser {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field(() => [TypeAccount])
  accounts: TypeAccount[];
}
