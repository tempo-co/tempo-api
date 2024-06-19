import {ArgsType, Field} from '@nestjs/graphql';
import {IsEmail, IsString, MaxLength, MinLength} from 'class-validator';

@ArgsType()
export class ArgsLogIn {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}
