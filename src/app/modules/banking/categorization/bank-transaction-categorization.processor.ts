import {Processor, WorkerHost} from '@nestjs/bullmq';
import {Job} from 'bullmq';

import {BANK_TRANSACTION_CATEGORIZATION_QUEUE, CATEGORIZE_BANK_TRANSACTIONS_JOB} from '@core/queue/queue.constants';

import {
	BankTransactionCategorizationJobData,
	BankTransactionCategorizationService,
} from './bank-transaction-categorization.service';

@Processor(BANK_TRANSACTION_CATEGORIZATION_QUEUE, {concurrency: 1})
export class BankTransactionCategorizationProcessor extends WorkerHost {
	constructor(private readonly categorizationService: BankTransactionCategorizationService) {
		super();
	}

	async process(job: Job<BankTransactionCategorizationJobData>): Promise<void> {
		if (job.name !== CATEGORIZE_BANK_TRANSACTIONS_JOB) return;
		await this.categorizationService.processTransactionJob(
			job.data.transactionIds,
			job.data.webSearchBackfill === true,
		);
	}
}
