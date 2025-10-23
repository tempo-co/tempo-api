import {Processor, WorkerHost} from '@nestjs/bullmq';
import {Job} from 'bullmq';

import {BANK_STATEMENT_QUEUE} from '@core/queue/queue.constants';

import {BankStatementJob} from './api/dtos/bank-statement-job.dto';
import {BankStatementService} from './bank-statement.service';

@Processor(BANK_STATEMENT_QUEUE)
export class BankStatementProcessor extends WorkerHost {
	constructor(private readonly bankStatementService: BankStatementService) {
		super();
	}

	async process(job: Job<BankStatementJob>) {
		await this.bankStatementService.processUpload(job);
	}
}
