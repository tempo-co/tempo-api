import {Expose} from 'class-transformer';
import {IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength} from 'class-validator';

import {CURRENCY_CODES} from '@modules/currency/currencies';
import {Bank} from '@modules/transaction/transaction-mapper/constants/bank.enum';

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
	@IsIn(CURRENCY_CODES, {message: 'Please select a valid currency.'})
	@Expose()
	currency: BankAccount['currency'];
}
