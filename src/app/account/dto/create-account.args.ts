import { Field, ArgsType } from '@nestjs/graphql';
import { IsEnum, Length } from 'class-validator';
import { Bank } from 'src/app/bank-transaction-adapter/models/bank.model';

@ArgsType()
export class CreateAccountArgs {
  @Field()
  @Length(1, 50)
  alias: string;

  @Field()
  @IsEnum(Bank)
  bank: Bank;
}
