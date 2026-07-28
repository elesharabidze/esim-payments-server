import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../orders/entities/order.entity';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { ExezineProvider } from './exezine.provider';
import { MockProvider } from './mock.provider';

@Module({
  imports: [HttpModule, ConfigModule, TypeOrmModule.forFeature([Order])],
  providers: [
    ExezineProvider,
    MockProvider,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (config: ConfigService, exezine: ExezineProvider, mock: MockProvider) => {
        const provider = config.get<string>('payments.provider', 'mock');
        return provider === 'exezine' ? exezine : mock;
      },
      inject: [ConfigService, ExezineProvider, MockProvider],
    },
  ],
  exports: [PAYMENT_PROVIDER, MockProvider],
})
export class PaymentProviderModule {}
