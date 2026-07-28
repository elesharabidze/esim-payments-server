import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PAYMENT_PROVIDER, PaymentProvider } from './provider/payment-provider.interface';

/**
 * The /payments/mock/* endpoints settle a checkout without any money moving, so they must
 * not exist once a real gateway is configured - otherwise anyone holding a payment token
 * could mark an order paid. They 404 rather than 403 so the mock surface is invisible in a
 * real deployment.
 */
@Injectable()
export class MockOnlyGuard implements CanActivate {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider) {}

  canActivate(): boolean {
    if (this.paymentProvider.name !== 'mock') {
      throw new NotFoundException('Cannot resolve this route');
    }
    return true;
  }
}
