import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { OrderStatus } from '../../orders/order-status.enum';
import { MockProvider } from './mock.provider';

describe('MockProvider', () => {
  const plan = {
    countryName: 'Azerbaijan',
    dataAmountGb: 3,
    unlimitedData: false,
    validityDays: 7,
  };

  let rows: any[];
  let provider: MockProvider;

  /** Only the lookup MockProvider actually performs. */
  function repositoryOver(store: any[]): Repository<Order> {
    return {
      findOne: jest.fn(
        async ({ where: { paymentToken } }: any) =>
          store.find((o) => o.paymentToken === paymentToken) ?? null,
      ),
    } as unknown as Repository<Order>;
  }

  function newProvider(): MockProvider {
    const config = { get: () => 'http://localhost:5173' } as unknown as ConfigService;
    return new MockProvider(config, repositoryOver(rows));
  }

  beforeEach(() => {
    rows = [
      {
        id: 'order-1',
        plan,
        status: OrderStatus.AWAITING_PAYMENT,
        amountMinorUnits: 999,
        currency: 'USD',
        paymentToken: 'tok-1',
        paymentUid: null,
      },
    ];
    provider = newProvider();
  });

  const baseParams = {
    orderId: 'order-1',
    amountMinorUnits: 999,
    currency: 'USD',
    description: 'Test plan',
    customerEmail: 'a@b.com',
    returnUrl: 'http://localhost:5173/checkout/return',
    notificationUrl: 'http://localhost:3000/api/payments/webhook',
  };

  it('creates a checkout that redirects into the frontend mock-checkout page', async () => {
    const result = await provider.createCheckout(baseParams);
    expect(result.redirectUrl).toBe(`http://localhost:5173/mock-checkout/${result.token}`);
  });

  it('reads a pending checkout back from the order row', async () => {
    const status = await provider.getCheckoutStatus('tok-1');
    expect(status.status).toBe('pending');
    expect(status.amountMinorUnits).toBe(999);

    const record = await provider.getMockCheckout('tok-1');
    expect(record.orderId).toBe('order-1');
    expect(record.description).toBe('Azerbaijan eSIM - 3GB / 7 days');
  });

  /**
   * The bug this store replaced: on serverless the request that creates a checkout is
   * usually not the one that reads it back, so anything held in instance memory is gone.
   */
  it('serves a checkout created by one instance from a different instance', async () => {
    const { token } = await provider.createCheckout(baseParams);
    rows[0].paymentToken = token;

    const otherInstance = newProvider();
    await expect(otherInstance.getMockCheckout(token)).resolves.toMatchObject({
      orderId: 'order-1',
      status: 'pending',
    });
  });

  it('derives the checkout status from the order status', async () => {
    rows[0].status = OrderStatus.PAID;
    rows[0].paymentUid = 'uid-1';

    const status = await provider.getCheckoutStatus('tok-1');
    expect(status.status).toBe('successful');
    expect(status.uid).toBe('uid-1');

    rows[0].status = OrderStatus.DECLINED;
    expect((await provider.getCheckoutStatus('tok-1')).status).toBe('declined');

    rows[0].status = OrderStatus.FAILED;
    expect((await provider.getCheckoutStatus('tok-1')).status).toBe('failed');
  });

  it('resolving builds a return URL carrying token/uid/status', async () => {
    const { redirectUrl, uid, outcome } = await provider.resolveMockCheckout('tok-1', 'successful');
    const url = new URL(redirectUrl);

    expect(url.origin + url.pathname).toBe('http://localhost:5173/checkout/return');
    expect(url.searchParams.get('token')).toBe('tok-1');
    expect(url.searchParams.get('status')).toBe('successful');
    expect(url.searchParams.get('uid')).toBe(uid);
    expect(outcome).toBe('successful');
  });

  it('resolves by card number, mapping the PAN to an outcome', async () => {
    expect((await provider.resolveMockCheckoutByCard('tok-1', '4000 0000 0000 0002')).outcome).toBe(
      'declined',
    );
    expect((await provider.resolveMockCheckoutByCard('tok-1', '4000 0000 0000 9995')).outcome).toBe(
      'failed',
    );

    const approved = await provider.resolveMockCheckoutByCard('tok-1', '4242 4242 4242 4242');
    expect(approved.outcome).toBe('successful');
    expect(new URL(approved.redirectUrl).searchParams.get('status')).toBe('successful');
  });

  it('throws NotFoundException for an unknown token', async () => {
    await expect(provider.getCheckoutStatus('does-not-exist')).rejects.toThrow(NotFoundException);
    await expect(provider.getMockCheckout('does-not-exist')).rejects.toThrow(NotFoundException);
  });
});
