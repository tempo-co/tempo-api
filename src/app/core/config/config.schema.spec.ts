import {configSchema} from './config.schema';

function createBaseConfig(overrides: Record<string, unknown> = {}) {
	return {
		WEB_BASE_URL: 'http://localhost:3001',
		NODE_ENV: 'test',
		PORT: 3000,
		API_URL: 'http://localhost:3000',
		DB_HOST: 'localhost',
		DB_PORT: 5432,
		DB_USERNAME: 'test-user',
		DB_PASSWORD: 'test-password',
		DB_NAME: 'test-db',
		DB_SYNCHRONIZE: true,
		DB_PGADMIN_PORT: 5050,
		SESSION_SECRET: 'test-session-secret',
		SESSION_EXPIRATION: '1d',
		SESSION_REDIS_KEY: 'test-session-key',
		REDIS_URL: 'redis://localhost:6379',
		REDIS_PORT: 6379,
		REDIS_HOST: 'localhost',
		REDIS_INSIGHT_PORT: 8001,
		ENABLE_BANKING_API_URL: 'https://api.example.test',
		ENABLE_BANKING_APPLICATION_ID: 'test-application',
		ENABLE_BANKING_PRIVATE_KEY_B64: 'test-private-key',
		ENABLE_BANKING_REDIRECT_URL: 'http://localhost:3001/bank-connections/callback',
		BANKING_SESSION_ENCRYPTION_KEY_B64: 'test-encryption-key',
		EMAIL_HOST: 'localhost',
		EMAIL_PORT: 1025,
		EMAIL_UI_PORT: 8025,
		EMAIL_UI_URL: 'http://localhost:8025',
		EMAIL_VERIFICATION_EXPIRATION: '1h',
		EMAIL_VERIFICATION_REDIS_KEY: 'test-email-verification',
		PASSWORD_RESET_EXPIRATION: '1h',
		PASSWORD_RESET_REDIS_KEY: 'test-password-reset',
		THROTTLE_TTL: '1m',
		THROTTLE_LIMIT: 100,
		...overrides,
	};
}

describe('configSchema AI categorization settings', () => {
	it('defaults AI categorization to disabled OpenAI with the configured initial model', () => {
		const config = configSchema.parse(createBaseConfig());

		expect(config.AI_CATEGORIZATION_ENABLED).toBe(false);
		expect(config.AI_CATEGORIZATION_PROVIDER).toBe('openai');
		expect(config.AI_CATEGORIZATION_MODEL).toBe('gpt-5.6-luna');
	});

	it('allows disabled categorization without an OpenAI key', () => {
		expect(() => configSchema.parse(createBaseConfig({AI_CATEGORIZATION_ENABLED: false}))).not.toThrow();
	});

	it('requires an OpenAI key only when enabled for OpenAI', () => {
		expect(() =>
			configSchema.parse(
				createBaseConfig({AI_CATEGORIZATION_ENABLED: true, AI_CATEGORIZATION_PROVIDER: 'openai'}),
			),
		).toThrow();
		expect(() =>
			configSchema.parse(
				createBaseConfig({
					AI_CATEGORIZATION_ENABLED: true,
					AI_CATEGORIZATION_PROVIDER: 'openai',
					OPENAI_API_KEY: 'test-openai-key',
				}),
			),
		).not.toThrow();
	});

	it('validates provider identifiers and model length', () => {
		expect(() => configSchema.parse(createBaseConfig({AI_CATEGORIZATION_PROVIDER: 'OpenAI'}))).toThrow();
		expect(() => configSchema.parse(createBaseConfig({AI_CATEGORIZATION_MODEL: 'm'.repeat(129)}))).toThrow();
	});
});
