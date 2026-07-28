import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { EsimModule } from './esim/esim.module';
import { PaymentsModule } from './payments/payments.module';
import { Plan } from './catalog/entities/plan.entity';
import { Order } from './orders/entities/order.entity';
import { Esim } from './esim/entities/esim.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [Plan, Order, Esim],
        // Fine for a demo/test project; a real app would use migrations instead.
        synchronize: true,
      }),
    }),
    CatalogModule,
    OrdersModule,
    EsimModule,
    PaymentsModule,
  ],
})
export class AppModule {}
