import {IsEnum, IsOptional, IsString, MaxLength} from 'class-validator';

import {Bank} from '@core/transaction-mapper/constants/bank.enum';
import {Account} from '@entities/account/account.entity';

export class AccountCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  alias: Account['alias'];

  @IsEnum(Bank)
  bank: Account['bank'];
}
