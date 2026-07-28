import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PaymentProviderModule } from '../payments/provider/payment-provider.module';

@Module({
  imports: [PaymentProviderModule],
  controllers: [HealthController],
})
export class HealthModule {}
