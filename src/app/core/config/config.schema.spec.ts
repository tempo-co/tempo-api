import {configSchema} from './config.schema';

const baseConfig = {
	WEB_BASE_URL: 'https://example.test/',
	NODE_ENV: 'test',
	PORT: '3000',
	API_URL: 'http://api:3000',
	DB_HOST: 'postgres',
	DB_PORT: '5432',
	DB_USERNAME: 'tempo',
	DB_PASSWORD: 'test-password',
	DB_NAME: 'tempo',
	DB_SYNCHRONIZE: 'false',
	DB_PGADMIN_PORT: '5050',
	SESSION_SECRET: 'test-session-secret',
	SESSION_EXPIRATION: '30d',
	SESSION_REDIS_KEY: 'sess',
	REDIS_URL: 'redis://redis:6379',
	REDIS_PORT: '6379',
	REDIS_HOST: 'redis',
	REDIS_INSIGHT_PORT: '5540',
	ENABLE_BANKING_API_URL: 'https://api.enablebanking.com',
	ENABLE_BANKING_APPLICATION_ID: 'test-application',
	ENABLE_BANKING_PRIVATE_KEY_B64: 'test-private-key',
	ENABLE_BANKING_REDIRECT_URL: 'https://example.test/callback',
	BANKING_SESSION_ENCRYPTION_KEY_B64: 'test-encryption-key',
	EMAIL_HOST: 'mailpit',
	EMAIL_PORT: '1025',
	EMAIL_UI_PORT: '8025',
	EMAIL_UI_URL: 'http://mailpit:8025',
	EMAIL_VERIFICATION_EXPIRATION: '1d',
	EMAIL_VERIFICATION_REDIS_KEY: 'email-verification',
	PASSWORD_RESET_EXPIRATION: '1h',
	PASSWORD_RESET_REDIS_KEY: 'password-reset',
	THROTTLE_TTL: '1m',
	THROTTLE_LIMIT: '100',
};

describe('categorization web-search configuration', () => {
	it('defaults the fallback off', () => {
		const parsed = configSchema.parse(baseConfig);

		expect(parsed.AI_CATEGORIZATION_WEB_SEARCH_ENABLED).toBe(false);
	});

	it('accepts an explicit fallback toggle', () => {
		const parsed = configSchema.parse({
			...baseConfig,
			AI_CATEGORIZATION_WEB_SEARCH_ENABLED: 'true',
		});

		expect(parsed.AI_CATEGORIZATION_WEB_SEARCH_ENABLED).toBe(true);
	});

	it('accepts an explicit owner identity token', () => {
		const parsed = configSchema.parse({
			...baseConfig,
			BANK_TRANSACTION_OWNER_IDENTITY_TOKEN: 'synthetic-surname',
		});

		expect(parsed.BANK_TRANSACTION_OWNER_IDENTITY_TOKEN).toBe('synthetic-surname');
	});
});
