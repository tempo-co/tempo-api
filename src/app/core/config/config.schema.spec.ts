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

describe('boolean environment configuration', () => {
	it('parses literal false strings as false', () => {
		const parsed = configSchema.parse({
			...baseConfig,
			EMAIL_SECURE: 'false',
		});

		expect(parsed.DB_SYNCHRONIZE).toBe(false);
		expect(parsed.EMAIL_SECURE).toBe(false);
	});
});

describe('session cookie configuration', () => {
	it('defaults to the production cookie contract', () => {
		const parsed = configSchema.parse(baseConfig);

		expect(parsed.SESSION_COOKIE_NAME).toBe('session');
		expect(parsed.SESSION_COOKIE_PATH).toBe('/');
	});

	it('accepts an isolated mounted-path cookie contract', () => {
		const parsed = configSchema.parse({
			...baseConfig,
			SESSION_COOKIE_NAME: 'tempo_staging_session',
			SESSION_COOKIE_PATH: '/staging',
		});

		expect(parsed.SESSION_COOKIE_NAME).toBe('tempo_staging_session');
		expect(parsed.SESSION_COOKIE_PATH).toBe('/staging');
	});
});

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
});

describe('banking integration configuration', () => {
	it('defaults banking integration to enabled for production compatibility', () => {
		const parsed = configSchema.parse(baseConfig);

		expect(parsed.BANKING_INTEGRATION_ENABLED).toBe(true);
	});

	it('allows banking integration to be disabled without a provider private key', () => {
		const parsed = configSchema.parse({
			...baseConfig,
			BANKING_INTEGRATION_ENABLED: 'false',
			ENABLE_BANKING_PRIVATE_KEY_B64: undefined,
			ENABLE_BANKING_PRIVATE_KEY_PATH: undefined,
		});

		expect(parsed.BANKING_INTEGRATION_ENABLED).toBe(false);
	});

	it('requires a provider private key when banking integration is enabled', () => {
		expect(() =>
			configSchema.parse({
				...baseConfig,
				BANKING_INTEGRATION_ENABLED: 'true',
				ENABLE_BANKING_PRIVATE_KEY_B64: undefined,
				ENABLE_BANKING_PRIVATE_KEY_PATH: undefined,
			}),
		).toThrow('Configure exactly one');
	});
});
