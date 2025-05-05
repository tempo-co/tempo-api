import {ISendMailOptions, MailerService} from '@nestjs-modules/mailer';
import {Processor, WorkerHost} from '@nestjs/bullmq';
import {Job} from 'bullmq';

import {EMAIL_QUEUE} from '@core/queue/queue.constants';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
	constructor(private readonly mailerService: MailerService) {
		super();
	}

	async process(job: Job<ISendMailOptions>) {
		await this.mailerService.sendMail(job.data);
	}
}
