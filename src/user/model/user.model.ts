import { Field, ID, ObjectType } from '@nestjs/graphql';
import { IsBoolean, IsDate, IsEmail, IsString, Length } from 'class-validator';

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  @IsString()
  @Length(1, 255)
  name: string;

  @Field()
  @IsEmail()
  @Length(1, 255)
  email: string;

  @Field()
  @IsBoolean()
  isActive: boolean;

  @Field()
  @IsDate()
  createdDate: Date;
}
