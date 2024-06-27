import {IsEnum, Length} from 'class-validator';

import {Bank} from '@core/transaction-mapper/constants/bank.enum';

export class AccountCreateDto {
  @Length(1, 50)
  alias: string;

  @IsEnum(Bank)
  bank: Bank;
}
