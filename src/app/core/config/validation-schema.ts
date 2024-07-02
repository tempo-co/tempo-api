import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production').required(),
  PORT: Joi.number().min(0).max(65535).required(),
  DB_HOST: Joi.string().regex(/\S/).required(),
  DB_PORT: Joi.number().min(0).max(65535).required(),
  DB_USERNAME: Joi.string().regex(/\S/).required(),
  DB_PASSWORD: Joi.string().regex(/\S/).required(),
  DB_NAME: Joi.string().regex(/\S/).required(),
  DB_SYNCHRONIZE: Joi.boolean().required(),
  ACCESS_TOKEN_SECRET: Joi.string().regex(/\S/).required(),
  ACCESS_TOKEN_EXPIRATION: Joi.string().regex(/\S/).required(),
  REFRESH_TOKEN_EXPIRATION: Joi.string().regex(/\S/).required(),
  GEMINI_API_KEY: Joi.string().regex(/\S/).required(),
});
