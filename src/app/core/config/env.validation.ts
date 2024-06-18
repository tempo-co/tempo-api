import {plainToInstance} from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'DB_TYPE cannot be whitespace'})
  DB_TYPE: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'DB_HOST cannot be whitespace'})
  DB_HOST: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'DB_USERNAME cannot be whitespace'})
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'DB_PASSWORD cannot be whitespace'})
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'DB_NAME cannot be whitespace'})
  DB_NAME: string;

  @IsBoolean()
  DB_SYNCHRONIZE: boolean;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {message: 'JWT_SECRET cannot be whitespace'})
  JWT_SECRET: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
