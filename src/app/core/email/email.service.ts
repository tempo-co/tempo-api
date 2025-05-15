import {ISendMailOptions} from '@nestjs-modules/mailer';
import {InjectQueue} from '@nestjs/bullmq';
import {Injectable} from '@nestjs/common';
import {Queue} from 'bullmq';

import {EMAIL_QUEUE, SEND_EMAIL_JOB} from '@core/queue/queue.constants';

@Injectable()
export class EmailService {
	constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue) {}

	async send(options: ISendMailOptions) {
		await this.emailQueue.add(SEND_EMAIL_JOB, options);
	}
}
