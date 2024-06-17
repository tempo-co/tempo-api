import { Field, ArgsType } from '@nestjs/graphql';
import { IsEnum, Length } from 'class-validator';
import { Bank } from 'src/app/transaction-mapper/models/bank.enum';

@ArgsType()
export class CreateAccountArgs {
  @Field()
  @Length(1, 50)
  alias: string;

  @Field()
  @IsEnum(Bank)
  bank: Bank;
}
