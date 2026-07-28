import { Controller, Get, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/provider/payment-provider.interface';

/**
 * Liveness/readiness probe. Reports the database separately from the process so a deploy that
 * boots but cannot reach Postgres is distinguishable from one that is simply down - the usual
 * failure mode here, where the app and the database are hosted independently.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  @Get()
  async check() {
    return {
      status: 'ok',
      paymentProvider: this.paymentProvider.name,
      database: (await this.isDatabaseReachable()) ? 'up' : 'down',
    };
  }

  private async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
