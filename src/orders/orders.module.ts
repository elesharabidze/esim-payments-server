import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CatalogModule } from '../catalog/catalog.module';
import { EsimModule } from '../esim/esim.module';
import { PaymentProviderModule } from '../payments/provider/payment-provider.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), CatalogModule, EsimModule, PaymentProviderModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
