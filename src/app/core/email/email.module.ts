import {MailerModule} from '@nestjs-modules/mailer';
import {HandlebarsAdapter} from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import {BullModule} from '@nestjs/bullmq';
import {Module} from '@nestjs/common';
import {join} from 'path';

import {ConfigurationService} from '@core/config/config.service';
import {EMAIL_QUEUE} from '@core/queue/queue.constants';

import {EmailProcessor} from './email.processor';
import {EmailService} from './email.service';

const DEFAULT_EMAIL_FROM = '"Tempo" <no-reply@localhost>';

export const createMailerOptions = (config: ConfigurationService) => {
	const username = config.get('EMAIL_USERNAME');
	const password = config.get('EMAIL_PASSWORD');

	return {
		transport: {
			host: config.get('EMAIL_HOST'),
			port: config.get('EMAIL_PORT'),
			secure: config.get('EMAIL_SECURE'),
			requireTLS: config.get('EMAIL_REQUIRE_TLS'),
			...(username && password ? {auth: {user: username, pass: password}} : {}),
		},
		defaults: {from: config.get('EMAIL_FROM') ?? DEFAULT_EMAIL_FROM},
		template: {
			dir: join(__dirname, 'templates'),
			adapter: new HandlebarsAdapter(),
			options: {strict: true},
		},
		options: {
			partials: {
				dir: join(__dirname, 'templates/partials'),
				options: {strict: true},
			},
		},
	};
};

@Module({
	imports: [
		MailerModule.forRootAsync({
			inject: [ConfigurationService],
			useFactory: createMailerOptions,
		}),
		BullModule.registerQueue({name: EMAIL_QUEUE}),
	],
	providers: [EmailService, EmailProcessor],
	exports: [EmailService, BullModule],
})
export class EmailModule {}
