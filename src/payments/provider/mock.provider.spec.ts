import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockProvider } from './mock.provider';

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    const config = { get: () => 'http://localhost:5173' } as unknown as ConfigService;
    provider = new MockProvider(config);
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

    const status = await provider.getCheckoutStatus(result.token);
    expect(status.status).toBe('pending');
    expect(status.amountMinorUnits).toBe(999);
  });

  it('resolving a checkout updates its status and builds a return URL with token/uid/status', async () => {
    const { token } = await provider.createCheckout(baseParams);

    const { redirectUrl } = provider.resolveMockCheckout(token, 'successful');
    const url = new URL(redirectUrl);

    expect(url.origin + url.pathname).toBe('http://localhost:5173/checkout/return');
    expect(url.searchParams.get('token')).toBe(token);
    expect(url.searchParams.get('status')).toBe('successful');
    expect(url.searchParams.get('uid')).toBeTruthy();

    const status = await provider.getCheckoutStatus(token);
    expect(status.status).toBe('successful');
    expect(status.uid).toBe(url.searchParams.get('uid'));
  });

  it('resolves by card number, mapping the PAN to an outcome', async () => {
    const declined = await provider.createCheckout(baseParams);
    provider.resolveMockCheckoutByCard(declined.token, '4000 0000 0000 0002');
    expect((await provider.getCheckoutStatus(declined.token)).status).toBe('declined');

    const failed = await provider.createCheckout(baseParams);
    provider.resolveMockCheckoutByCard(failed.token, '4000 0000 0000 9995');
    expect((await provider.getCheckoutStatus(failed.token)).status).toBe('failed');

    const approved = await provider.createCheckout(baseParams);
    const { redirectUrl } = provider.resolveMockCheckoutByCard(
      approved.token,
      '4242 4242 4242 4242',
    );
    expect(new URL(redirectUrl).searchParams.get('status')).toBe('successful');
    expect((await provider.getCheckoutStatus(approved.token)).status).toBe('successful');
  });

  it('throws NotFoundException for an unknown token', async () => {
    await expect(provider.getCheckoutStatus('does-not-exist')).rejects.toThrow(NotFoundException);
    expect(() => provider.getMockCheckout('does-not-exist')).toThrow(NotFoundException);
  });
});
