import {InjectQueue} from '@nestjs/bullmq';
import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {Queue} from 'bullmq';

import {ConfigurationService} from '@core/config/config.service';
import {
	BACKFILL_BANK_TRANSACTION_AMOUNTS_JOB,
	BANK_TRANSACTION_AMOUNT_CONVERSION_JOB,
	BANK_TRANSACTION_AMOUNT_CONVERSION_QUEUE,
	BANK_TRANSACTION_AMOUNT_CONVERSION_SCHEDULER_ID,
} from '@core/queue/queue.constants';

export type BankTransactionAmountConversionJobData = Record<string, never>;

const BACKFILL_JOB_ID = 'bank-transaction-amount-backfill-v1';
const CONVERSION_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class BankTransactionAmountConversionQueueService implements OnModuleInit {
	private readonly logger = new Logger(BankTransactionAmountConversionQueueService.name);

	constructor(
		@InjectQueue(BANK_TRANSACTION_AMOUNT_CONVERSION_QUEUE)
		private readonly queue: Queue<BankTransactionAmountConversionJobData>,
		private readonly configurationService: ConfigurationService,
	) {}

	async onModuleInit(): Promise<void> {
		if (this.configurationService.get('NODE_ENV') === 'test') return;
		if (!this.configurationService.get('BANKING_INTEGRATION_ENABLED')) {
			try {
				await this.queue.removeJobScheduler(BANK_TRANSACTION_AMOUNT_CONVERSION_SCHEDULER_ID);
			} catch (error) {
				this.logger.warn(
					`Could not remove disabled FX scheduler: ${error instanceof Error ? error.message : String(error)}`,
				);
				throw error;
			}
			return;
		}

		const existingBackfill = await this.queue.getJob(BACKFILL_JOB_ID);
		let shouldEnqueueBackfill = !existingBackfill;
		if (existingBackfill && (await existingBackfill.getState()) === 'failed') {
			await existingBackfill.remove();
			shouldEnqueueBackfill = true;
		}
		if (shouldEnqueueBackfill) {
			await this.queue.add(
				BACKFILL_BANK_TRANSACTION_AMOUNTS_JOB,
				{},
				{jobId: BACKFILL_JOB_ID, attempts: 3, removeOnComplete: false, removeOnFail: {age: 86_400, count: 10}},
			);
		}

		await this.queue.upsertJobScheduler(
			BANK_TRANSACTION_AMOUNT_CONVERSION_SCHEDULER_ID,
			{every: CONVERSION_INTERVAL_MS},
			{
				name: BANK_TRANSACTION_AMOUNT_CONVERSION_JOB,
				data: {},
				opts: {attempts: 1, removeOnComplete: true, removeOnFail: {age: 86_400, count: 100}},
			},
		);
	}
}
