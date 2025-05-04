import {z} from 'zod';

const portSchema = z.coerce.number().int().min(0).max(65535);

const durationPattern = /^[0-9]+(s|m|h|d|w)$/;
const durationSchema = z.string().regex(durationPattern);

export const ENV_VALUES = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof ENV_VALUES)[number];

export const configSchema = z.object({
	// --- General ---
	WEB_BASE_URL: z.string().url(),
	NODE_ENV: z.enum(ENV_VALUES),
	PORT: portSchema,

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

	// --- APIs ---
	GEMINI_API_KEY: z.string().min(1),

	// --- Email ---
	EMAIL_HOST: z.string().min(1),
	EMAIL_PORT: portSchema,
	EMAIL_UI_PORT: portSchema,
	EMAIL_UI_URL: z.string().url(),
	EMAIL_VERIFICATION_EXPIRATION: durationSchema,
	EMAIL_VERIFICATION_REDIS_KEY: z.string().min(1),

	// --- Rate limiting
	THROTTLE_TTL: durationSchema,
	THROTTLE_LIMIT: z.coerce.number().int().positive(),
});

export type Config = z.infer<typeof configSchema>;
