import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
  validateSync,
} from 'class-validator';

function hasNoConnectionString(env: EnvironmentVariables) {
  return !env.DATABASE_URL && !env.POSTGRES_URL;
}

class EnvironmentVariables {
  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false })
  BACKEND_URL!: string;

  // Either a single connection string (what hosted Postgres providers give you)
  // or the five discrete DB_* settings below. The string wins when both are set.
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  // Vercel Postgres injects this name rather than DATABASE_URL.
  @IsOptional()
  @IsString()
  POSTGRES_URL?: string;

  @ValidateIf(hasNoConnectionString)
  @IsString()
  DB_HOST!: string;

  @ValidateIf(hasNoConnectionString)
  @IsNumberString()
  DB_PORT!: string;

  @ValidateIf(hasNoConnectionString)
  @IsString()
  DB_USERNAME!: string;

  @ValidateIf(hasNoConnectionString)
  @IsString()
  DB_PASSWORD!: string;

  @ValidateIf(hasNoConnectionString)
  @IsString()
  DB_NAME!: string;

  @IsOptional()
  @IsBooleanString()
  DB_SSL?: string;

  @IsOptional()
  @IsBooleanString()
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsIn(['mock', 'exezine'])
  PAYMENT_PROVIDER?: 'mock' | 'exezine';

  @ValidateIf((env) => env.PAYMENT_PROVIDER === 'exezine')
  @IsString()
  EXEZINE_SHOP_ID?: string;

  @ValidateIf((env) => env.PAYMENT_PROVIDER === 'exezine')
  @IsString()
  EXEZINE_SECRET_KEY?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  EXEZINE_CHECKOUT_BASE_URL?: string;

  @IsOptional()
  @IsString()
  EXEZINE_WEBHOOK_PUBLIC_KEY?: string;

  @IsOptional()
  @IsBooleanString()
  EXEZINE_TEST_MODE?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }
  return validatedConfig;
}
