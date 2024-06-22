import {ArgsType, Field} from '@nestjs/graphql';
import {IsEmail, IsString, Length} from 'class-validator';

@ArgsType()
export class ArgsSignUp {
  @Field()
  @IsString()
  @Length(1, 255)
  name: string;

  @Field()
  @IsEmail()
  @Length(1, 255)
  email: string;

  @Field()
  @Length(8, 255)
  password: string;
}
