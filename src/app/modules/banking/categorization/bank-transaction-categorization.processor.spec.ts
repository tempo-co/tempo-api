import {Job} from 'bullmq';

import {CATEGORIZE_BANK_TRANSACTIONS_JOB} from '@core/queue/queue.constants';

import {BankTransactionCategorizationProcessor} from './bank-transaction-categorization.processor';
import {
	BankTransactionCategorizationJobData,
	BankTransactionCategorizationService,
} from './bank-transaction-categorization.service';

describe('BankTransactionCategorizationProcessor', () => {
	it('forwards only transaction IDs to the categorization service', async () => {
		const service = {
			processTransactionJob: jest.fn().mockResolvedValue(undefined),
		};
		const processor = new BankTransactionCategorizationProcessor(
			service as unknown as BankTransactionCategorizationService,
		);
		const job = {
			name: CATEGORIZE_BANK_TRANSACTIONS_JOB,
			data: {transactionIds: ['transaction-id']},
		} as unknown as Job<BankTransactionCategorizationJobData>;

		await processor.process(job);

		expect(service.processTransactionJob).toHaveBeenCalledWith(['transaction-id']);
	});
});
