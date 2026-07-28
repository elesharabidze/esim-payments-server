import { NotFoundException } from '@nestjs/common';
import { MockOnlyGuard } from './mock-only.guard';
import { PaymentProvider } from './provider/payment-provider.interface';

describe('MockOnlyGuard', () => {
  it('lets the mock checkout endpoints through when the mock provider is active', () => {
    const guard = new MockOnlyGuard({ name: 'mock' } as PaymentProvider);
    expect(guard.canActivate()).toBe(true);
  });

  it('hides them behind a 404 once a real gateway is configured', () => {
    // Otherwise POST /payments/mock/:token/pay would settle a real order without payment.
    const guard = new MockOnlyGuard({ name: 'exezine' } as PaymentProvider);
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});
