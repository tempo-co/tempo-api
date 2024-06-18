import {IsEnum, Length} from 'class-validator';
import {Field, InputType} from '@nestjs/graphql';
import {Bank} from '@core/transaction-mapper/models/bank.enum';

@InputType()
export class InputAccountCreate {
  @Field()
  @Length(1, 50)
  alias: string;

  @Field()
  @IsEnum(Bank)
  bank: Bank;
}
