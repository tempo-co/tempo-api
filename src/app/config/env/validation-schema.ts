import Joi from 'joi';

const nonWhitespaceString = Joi.string().regex(/\S/).required();
const uriString = Joi.string().uri().required();
const portNumber = Joi.number().integer().min(0).max(65535).required();

const durationPattern = /^[0-9]+(s|m|h|d|w)$/;
const expirationDuration = Joi.string().pattern(durationPattern).required();

export const validationSchema = Joi.object({
  WEB_BASE_URL: uriString,
  NODE_ENV: Joi.string().valid('development', 'production').required(),
  PORT: portNumber,
  DB_HOST: nonWhitespaceString,
  DB_PORT: portNumber,
  DB_USERNAME: nonWhitespaceString,
  DB_PASSWORD: nonWhitespaceString,
  DB_NAME: nonWhitespaceString,
  DB_SYNCHRONIZE: Joi.boolean().required(),
  PGADMIN_PORT: portNumber,
  SESSION_SECRET: nonWhitespaceString,
  SESSION_EXPIRATION: expirationDuration,
  SESSION_REDIS_KEY: nonWhitespaceString,
  REDIS_URL: uriString,
  REDIS_PORT: portNumber,
  REDIS_HOST: nonWhitespaceString,
  REDIS_INSIGHT_PORT: portNumber,
  GEMINI_API_KEY: nonWhitespaceString,
  EMAIL_HOST: nonWhitespaceString,
  EMAIL_PORT: portNumber,
  EMAIL_UI_PORT: portNumber,
  EMAIL_VERIFICATION_EXPIRATION: expirationDuration,
  EMAIL_VERIFICATION_REDIS_KEY: nonWhitespaceString,
});
