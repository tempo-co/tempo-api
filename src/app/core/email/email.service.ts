import {ISendMailOptions} from '@nestjs-modules/mailer';
import {InjectQueue} from '@nestjs/bullmq';
import {Injectable} from '@nestjs/common';
import {Queue} from 'bullmq';

import {EMAIL_QUEUE, SEND_EMAIL_JOB} from '@core/queue/queue.constants';

export type EmailJobData = ISendMailOptions & {accountId?: string};

@Injectable()
export class EmailService {
	constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<EmailJobData>) {}

	async send(options: ISendMailOptions, accountId: string) {
		await this.emailQueue.add(SEND_EMAIL_JOB, {...options, accountId});
	}

	async cancelPendingForAccount(accountId: string) {
		const jobs = await this.emailQueue.getJobs(['waiting', 'delayed']);
		await Promise.all(jobs.filter((job) => job.data.accountId === accountId).map((job) => job.remove()));
	}
}
