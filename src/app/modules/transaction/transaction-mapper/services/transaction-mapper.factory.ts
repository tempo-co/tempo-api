import {BadRequestException, Injectable} from '@nestjs/common';

import {Bank} from '../constants/bank.enum';
import {AbnAmroTransactionMapper} from './impl/abnamro-transaction-mapper';
import {RevolutTransactionMapper} from './impl/revolut-transaction-mapper';
import {TransactionMapper} from './transaction-mapper.interface';

@Injectable()
export class TransactionMapperFactory {
	constructor(
		private readonly abnAmroMapper: AbnAmroTransactionMapper,
		private readonly revolutMapper: RevolutTransactionMapper,
	) {}

	create(bank: Bank): TransactionMapper {
		switch (bank) {
			case Bank.ABN_AMRO:
				return this.abnAmroMapper;
			case Bank.REVOLUT:
				return this.revolutMapper;
			default:
				throw new BadRequestException(`Unsupported bank: ${bank}`);
		}
	}
}
