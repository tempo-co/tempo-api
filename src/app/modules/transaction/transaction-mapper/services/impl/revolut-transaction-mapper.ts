import {UnprocessableEntityException} from '@nestjs/common';
import {z} from 'zod';

import {amountPattern} from '../../constants/amount.regex';
import {TransactionCreateDto, TransactionMapper} from '../transaction-mapper.interface';

const revolutTransactionSchema = z.object({
	type: z.string().optional(),
	product: z.string().optional(),
	fee: z.string().optional(),
	state: z.string().optional(),
	balance: z.string().optional(),

	startedDate: z.string().datetime(),
	completedDate: z.string().datetime(),
	description: z.string().min(1),
	amount: z.string().regex(amountPattern),
	currency: z.string().min(1),
});

export type RevolutTransaction = z.infer<typeof revolutTransactionSchema>;

export class RevolutTransactionMapper implements TransactionMapper {
	map(transaction: RevolutTransaction): TransactionCreateDto {
		const validationResult = revolutTransactionSchema.safeParse(transaction);
		if (!validationResult.success) {
			throw new UnprocessableEntityException('File is not a valid Revolut bank statement.');
		}

		return {
			startedAt: new Date(transaction.startedDate),
			completedAt: new Date(transaction.completedDate),
			description: transaction.description.replace(/\s+/g, ' ').trim(),
			amount: parseFloat(transaction.amount),
			currency: transaction.currency,
		};
	}
}
