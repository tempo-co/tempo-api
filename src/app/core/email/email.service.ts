import {ISendMailOptions} from '@nestjs-modules/mailer';
import {InjectQueue} from '@nestjs/bullmq';
import {Injectable, Logger} from '@nestjs/common';
import {Queue} from 'bullmq';

import {EMAIL_QUEUE, SEND_EMAIL_JOB} from '@core/queue/queue.constants';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue) {}

  async send(options: ISendMailOptions): Promise<void> {
    try {
      await this.emailQueue.add(SEND_EMAIL_JOB, options);
    } catch (error) {
      this.logger.error(
        `Error adding email job to queue for recipient ${options.to}: ${error.message}`,
        error.stack,
      );
    }
  }
}
