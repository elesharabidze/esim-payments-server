import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
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
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const url = config.get<string>('database.url');

        return {
          type: 'postgres',
          // A connection string carries the credentials itself, so the discrete
          // settings are only consulted when DATABASE_URL is absent.
          ...(url
            ? { url }
            : {
                host: config.get<string>('database.host'),
                port: config.get<number>('database.port'),
                username: config.get<string>('database.username'),
                password: config.get<string>('database.password'),
                database: config.get<string>('database.name'),
              }),
          ssl: config.get<boolean>('database.ssl')
            ? { rejectUnauthorized: config.get<boolean>('database.sslRejectUnauthorized') }
            : false,
          poolSize: config.get<number>('database.poolSize'),
          retryAttempts: config.get<number>('database.retryAttempts'),
          entities: [Plan, Order, Esim],
          synchronize: config.get<boolean>('database.synchronize'),
        };
      },
    }),
    CatalogModule,
    OrdersModule,
    EsimModule,
    PaymentsModule,
  ],
})
export class AppModule {}
