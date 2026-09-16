import {z} from 'zod';

const portSchema = z.coerce.number().int().min(0).max(65535);

const durationPattern = /^[0-9]+(s|m|h|d|w)$/;
const durationSchema = z.string().regex(durationPattern);
const strictBooleanEnvSchema = z.preprocess((value) => {
	if (typeof value !== 'string') return value;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	return value;
}, z.boolean());

export const ENV_VALUES = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof ENV_VALUES)[number];

export const configSchema = z
	.object({
		// --- General ---
		WEB_BASE_URL: z.string().url(),
		NODE_ENV: z.enum(ENV_VALUES),
		PORT: portSchema,
		API_URL: z.string().min(1),

		// --- Database ---
		DB_HOST: z.string().min(1),
		DB_PORT: portSchema,
		DB_USERNAME: z.string().min(1),
		DB_PASSWORD: z.string().min(1),
		DB_NAME: z.string().min(1),
		DB_SYNCHRONIZE: z.coerce.boolean(),
		DB_PGADMIN_PORT: portSchema,

		// --- Session ---
		SESSION_SECRET: z.string().min(1),
		SESSION_EXPIRATION: durationSchema,
		SESSION_REDIS_KEY: z.string().min(1),

		// --- Redis ---
		REDIS_URL: z.string().url(),
		REDIS_PORT: portSchema,
		REDIS_HOST: z.string().min(1),
		REDIS_INSIGHT_PORT: portSchema,

		// --- AI categorization ---
		AI_CATEGORIZATION_ENABLED: strictBooleanEnvSchema.default(false),
		AI_CATEGORIZATION_PROVIDER: z
			.string()
			.regex(/^[a-z][a-z0-9-]*$/)
			.default('openai'),
		AI_CATEGORIZATION_MODEL: z.string().min(1).max(128).default('gpt-5.6-luna'),
		AI_CATEGORIZATION_WEB_SEARCH_ENABLED: strictBooleanEnvSchema.default(false),
		OPENAI_API_KEY: z.string().min(1).optional(),

		// --- APIs ---
		ENABLE_BANKING_API_URL: z.string().url(),
		ENABLE_BANKING_APPLICATION_ID: z.string().min(1),
		ENABLE_BANKING_PRIVATE_KEY_B64: z.string().min(1).optional(),
		ENABLE_BANKING_PRIVATE_KEY_PATH: z.string().min(1).optional(),
		ENABLE_BANKING_REDIRECT_URL: z.string().url(),
		BANKING_SESSION_ENCRYPTION_KEY_B64: z.string().min(1),

		// --- Email ---
		EMAIL_HOST: z.string().min(1),
		EMAIL_PORT: portSchema,
		EMAIL_SECURE: z.coerce.boolean().default(false),
		EMAIL_UI_PORT: portSchema,
		EMAIL_UI_URL: z.string().url(),
		EMAIL_VERIFICATION_EXPIRATION: durationSchema,
		EMAIL_VERIFICATION_REDIS_KEY: z.string().min(1),

		// --- Password reset ---
		PASSWORD_RESET_EXPIRATION: durationSchema,
		PASSWORD_RESET_REDIS_KEY: z.string().min(1),

		// --- Rate limiting ---
		THROTTLE_TTL: durationSchema,
		THROTTLE_LIMIT: z.coerce.number().int().positive(),
	})
	.superRefine((config, context) => {
		const hasPrivateKeyB64 = config.ENABLE_BANKING_PRIVATE_KEY_B64 !== undefined;
		const hasPrivateKeyPath = config.ENABLE_BANKING_PRIVATE_KEY_PATH !== undefined;

		if (hasPrivateKeyB64 === hasPrivateKeyPath) {
			context.addIssue({
				code: 'custom',
				path: ['ENABLE_BANKING_PRIVATE_KEY_B64'],
				message: 'Configure exactly one of ENABLE_BANKING_PRIVATE_KEY_B64 or ENABLE_BANKING_PRIVATE_KEY_PATH.',
			});
		}

		if (
			config.AI_CATEGORIZATION_ENABLED &&
			config.AI_CATEGORIZATION_PROVIDER === 'openai' &&
			!config.OPENAI_API_KEY
		) {
			context.addIssue({
				code: 'custom',
				path: ['OPENAI_API_KEY'],
				message: 'OPENAI_API_KEY is required when OpenAI categorization is enabled.',
			});
		}
	});

export type Config = z.infer<typeof configSchema>;
