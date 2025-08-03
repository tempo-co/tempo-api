import {GenerativeModel} from '@google/generative-ai';
import {Injectable} from '@nestjs/common';
import crypto from 'node:crypto';

import {TransactionCreateDto} from '@modules/transaction/transaction-mapper/services/transaction-mapper.interface';
import {Transaction} from '@modules/transaction/transaction.entity';

import {Category} from '../constants/category.enum';

const BATCH_SIZE = 100;

type CategorizedTransactionPartial = TransactionCreateDto & {category: Transaction['category']};
type TransactionToCategorize = TransactionCreateDto & {correlationId: string};

@Injectable()
export class TransactionCategorizerService {
	private static readonly validCategories = new Set<string>(Object.values(Category));

	constructor(private readonly model: GenerativeModel) {}

	async categorize(transactions: TransactionCreateDto[]) {
		if (transactions.length === 0) return [];

		const transactionsWithId: TransactionToCategorize[] = transactions.map((transaction) => ({
			...transaction,
			correlationId: crypto.randomUUID(),
		}));

		const batches: TransactionToCategorize[][] = [];

		for (let i = 0; i < transactionsWithId.length; i += BATCH_SIZE) {
			batches.push(transactionsWithId.slice(i, i + BATCH_SIZE));
		}

		const batchPromises = batches.map((batch) => this._processBatch(batch));
		const results = await Promise.allSettled(batchPromises);

		return results.flatMap((result, index) => {
			if (result.status === 'rejected') {
				return batches[index].map(({correlationId, ...rest}) => ({...rest, category: Category.OTHER}));
			}
			return result.value;
		});
	}

	private async _processBatch(batch: TransactionToCategorize[]): Promise<CategorizedTransactionPartial[]> {
		const fieldsToInclude: (keyof TransactionToCategorize)[] = [
			'correlationId',
			'description',
			'amount',
			'currency',
		];
		const serializedTransactions = JSON.stringify(batch, fieldsToInclude);
		const result = await this.model.generateContent(serializedTransactions);

		const categorizedBatch: {correlationId: string; category: string}[] = JSON.parse(result.response.text());
		const categories = new Map(categorizedBatch.map((item) => [item.correlationId, item.category]));

		return batch.map(({correlationId, ...rest}) => {
			const rawCategory = categories.get(correlationId);
			const isValidCategory = rawCategory && TransactionCategorizerService.validCategories.has(rawCategory);

			const category = isValidCategory ? (rawCategory as Category) : Category.OTHER;
			return {...rest, category};
		});
	}
}
