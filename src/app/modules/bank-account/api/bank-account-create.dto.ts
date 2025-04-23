import {Expose} from 'class-transformer';
import {IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength} from 'class-validator';

import {Bank} from '@modules/transaction/transaction-mapper/constants/bank.enum';
import {currencyCodes} from '@modules/transaction/transaction-mapper/constants/currency-codes';

import {BankAccount} from '../bank-account.entity';

export class BankAccountCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  alias: BankAccount['alias'];

  @IsEnum(Bank)
  bank: BankAccount['bank'];

  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  @IsIn(currencyCodes)
  @Expose()
  currency: BankAccount['currency'];
}
