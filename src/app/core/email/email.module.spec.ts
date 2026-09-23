import {ConfigurationService} from '@core/config/config.service';

import {createMailerOptions} from './email.module';

type EmailConfig = {
	EMAIL_HOST: string;
	EMAIL_PORT: number;
	EMAIL_SECURE: boolean;
	EMAIL_REQUIRE_TLS: boolean;
	EMAIL_USERNAME?: string;
	EMAIL_PASSWORD?: string;
	EMAIL_FROM?: string;
};

const makeConfig = (values: EmailConfig): ConfigurationService =>
	({get: (key: keyof EmailConfig) => values[key]}) as unknown as ConfigurationService;

describe('EmailModule SMTP options', () => {
	it('configures Gmail authentication, STARTTLS, and the selected sender', () => {
		const options = createMailerOptions(
			makeConfig({
				EMAIL_HOST: 'smtp.gmail.com',
				EMAIL_PORT: 587,
				EMAIL_SECURE: false,
				EMAIL_REQUIRE_TLS: true,
				EMAIL_USERNAME: 'mailer@example.test',
				EMAIL_PASSWORD: 'synthetic-app-password',
				EMAIL_FROM: 'Tempo <mailer@example.test>',
			}),
		);

		expect(options.transport).toMatchObject({
			host: 'smtp.gmail.com',
			port: 587,
			secure: false,
			requireTLS: true,
			auth: {user: 'mailer@example.test', pass: 'synthetic-app-password'},
		});
		expect(options.defaults.from).toBe('Tempo <mailer@example.test>');
	});

	it('does not configure SMTP authentication for Mailpit', () => {
		const options = createMailerOptions(
			makeConfig({
				EMAIL_HOST: 'mailpit',
				EMAIL_PORT: 1025,
				EMAIL_SECURE: false,
				EMAIL_REQUIRE_TLS: false,
			}),
		);

		expect(options.transport).toMatchObject({
			host: 'mailpit',
			port: 1025,
			secure: false,
			requireTLS: false,
		});
		expect(options.transport).not.toHaveProperty('auth');
		expect(options.defaults.from).toBe('"Tempo" <no-reply@localhost>');
	});
});
