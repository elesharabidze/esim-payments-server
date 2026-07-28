import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';
import { PaymentProviderModule } from './provider/payment-provider.module';

@Module({
  imports: [OrdersModule, PaymentProviderModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
