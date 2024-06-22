import 'reflect-metadata';

import {validate} from './env.validation';

describe('EnvironmentVariables validation', () => {
  const validConfig = {
    NODE_ENV: 'development',
    PORT: 3000,
    DB_TYPE: 'postgres',
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'user',
    DB_PASSWORD: 'password',
    DB_NAME: 'test_db',
    DB_SYNCHRONIZE: true,
    JWT_SECRET: 'secret',
  };

  it('should validate a valid configuration', () => {
    expect(() => validate(validConfig)).not.toThrow();
  });

  it('should throw an error for an invalid NODE_ENV', () => {
    const invalidConfig = {...validConfig, NODE_ENV: 'invalid_env'};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid PORT', () => {
    const invalidConfig = {...validConfig, PORT: -1};
    expect(() => validate(invalidConfig)).toThrow(Error);

    invalidConfig.PORT = 70000;
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for missing required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {NODE_ENV, ...invalidConfig} = validConfig;
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_PORT', () => {
    const invalidConfig = {...validConfig, DB_PORT: 70000};
    expect(() => validate(invalidConfig)).toThrow(Error);

    invalidConfig.DB_PORT = -1;
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid JWT_SECRET', () => {
    const invalidConfig = {...validConfig, JWT_SECRET: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_TYPE', () => {
    const invalidConfig = {...validConfig, DB_TYPE: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_HOST', () => {
    const invalidConfig = {...validConfig, DB_HOST: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_USERNAME', () => {
    const invalidConfig = {...validConfig, DB_USERNAME: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_PASSWORD', () => {
    const invalidConfig = {...validConfig, DB_PASSWORD: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });

  it('should throw an error for an invalid DB_NAME', () => {
    const invalidConfig = {...validConfig, DB_NAME: ''};
    expect(() => validate(invalidConfig)).toThrow(Error);
  });
});
