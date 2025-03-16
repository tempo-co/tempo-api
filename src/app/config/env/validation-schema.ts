import Joi from 'joi';

const durationPattern = /^[0-9]+(s|m|h|d|w)$/;

export const validationSchema = Joi.object({
  WEB_BASE_URL: Joi.string().uri().required(),
  NODE_ENV: Joi.string().valid('development', 'production').required(),
  PORT: Joi.number().min(0).max(65535).required(),
  DB_HOST: Joi.string().regex(/\S/).required(),
  DB_PORT: Joi.number().min(0).max(65535).required(),
  DB_USERNAME: Joi.string().regex(/\S/).required(),
  DB_PASSWORD: Joi.string().regex(/\S/).required(),
  DB_NAME: Joi.string().regex(/\S/).required(),
  DB_SYNCHRONIZE: Joi.boolean().required(),
  SESSION_SECRET: Joi.string().regex(/\S/).required(),
  SESSION_EXPIRATION: Joi.string().regex(durationPattern).required(),
  REDIS_URL: Joi.string()
    .uri({scheme: ['redis']})
    .required(),
  GEMINI_API_KEY: Joi.string().regex(/\S/).required(),
  EMAIL_HOST: Joi.string().regex(/\S/).required(),
  EMAIL_USERNAME: Joi.string().regex(/\S/).required(),
  EMAIL_PASSWORD: Joi.string().regex(/\S/).required(),
  EMAIL_VERIFICATION_EXPIRATION: Joi.string().regex(durationPattern).required(),
});
