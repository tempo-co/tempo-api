import {ISendMailOptions, MailerService} from '@nestjs-modules/mailer';
import {Processor, WorkerHost} from '@nestjs/bullmq';
import {Logger} from '@nestjs/common';
import {Job} from 'bullmq';

import {EMAIL_QUEUE} from '@core/queue/queue.constants';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
	private readonly logger = new Logger(EmailProcessor.name);

	constructor(private readonly mailerService: MailerService) {
		super();
	}

	async process(job: Job<ISendMailOptions>) {
		try {
			await this.mailerService.sendMail(job.data);
		} catch (error) {
			this.logger.error(
				`Error sending email job ${job.id} for recipient ${job.data.to}: ${error.message}`,
				error.stack,
			);
			throw error;
		}
	}
}
