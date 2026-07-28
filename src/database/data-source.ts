import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Plan } from '../catalog/entities/plan.entity';
import { Order } from '../orders/entities/order.entity';
import { Esim } from '../esim/entities/esim.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'esim',
  password: process.env.DB_PASSWORD ?? 'esim',
  database: process.env.DB_NAME ?? 'esim',
  entities: [Plan, Order, Esim],
  synchronize: true,
});
