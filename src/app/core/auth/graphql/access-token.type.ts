import {Field, ObjectType} from '@nestjs/graphql';

@ObjectType()
export class TypeAccessToken {
  @Field()
  access_token: string;
}
