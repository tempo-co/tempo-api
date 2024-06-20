import {IsEnum, Length} from 'class-validator';
import {ArgsType, Field} from '@nestjs/graphql';
import {Bank} from '@core/transaction-mapper/constants/bank.enum';

@ArgsType()
export class ArgsAccountCreate {
  @Field()
  @Length(1, 50)
  alias: string;

  @Field()
  @IsEnum(Bank)
  bank: Bank;
}
