import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Plan } from '../catalog/entities/plan.entity';
import { Order } from '../orders/entities/order.entity';
import { Esim } from '../esim/entities/esim.entity';

config();

// Kept in step with src/config/configuration.ts so `npm run seed` can target the
// same hosted database the deployed app uses.
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const ssl = (process.env.DB_SSL ?? (url ? 'true' : 'false')) === 'true';

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(url
    ? { url }
    : {
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USERNAME ?? 'esim',
        password: process.env.DB_PASSWORD ?? 'esim',
        database: process.env.DB_NAME ?? 'esim',
      }),
  ssl: ssl
    ? { rejectUnauthorized: (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'false') === 'true' }
    : false,
  entities: [Plan, Order, Esim],
  synchronize: true,
});
