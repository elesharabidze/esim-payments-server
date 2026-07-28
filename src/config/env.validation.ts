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

class EnvironmentVariables {
  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false })
  BACKEND_URL!: string;

  @IsString()
  DB_HOST!: string;

  @IsNumberString()
  DB_PORT!: string;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

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
