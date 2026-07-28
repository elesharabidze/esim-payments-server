import { createSign, generateKeyPairSync } from 'crypto';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ExezineProvider } from './exezine.provider';
import { CreateCheckoutParams } from './payment-provider.interface';

/**
 * E-XEZINE credentials are only issued to an onboarded merchant (the backoffice hands out the
 * Shop ID / Secret Key, and test mode is a flag on an existing shop rather than a standalone
 * sandbox), so this provider cannot be exercised against the live gateway here.
 *
 * Everything short of the network can still be pinned down, and that is what these tests do:
 * the request this provider would put on the wire is asserted field by field against the shape
 * documented at docs.e-xezine.az, the responses it must cope with are replayed through a stubbed
 * HttpService, and the webhook signature check - the security-critical half, since it is what
 * stops anyone from POSTing a fake "payment successful" - is verified end to end against a real
 * RSA keypair generated in the test.
 */

const SHOP_ID = 'shop-123';
const SECRET_KEY = 'secret-abc';
const BASE_URL = 'https://checkout.e-xezine.az';

// Generated per run rather than committed: a checked-in private key is a bad habit to model,
// even a throwaway one.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Signs a body exactly the way E-XEZINE signs its notifications: RSA-SHA256, base64. */
function signBody(body: Buffer | string, key = privateKey): string {
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  return signer.sign(key, 'base64');
}

function buildProvider(overrides: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = {
    'payments.exezine.shopId': SHOP_ID,
    'payments.exezine.secretKey': SECRET_KEY,
    'payments.exezine.checkoutBaseUrl': BASE_URL,
    'payments.exezine.webhookPublicKey': publicKey,
    'payments.exezine.testMode': true,
    ...overrides,
  };

  const http = {
    post: jest.fn(),
    get: jest.fn(),
  };
  const config = {
    get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
  };

  const provider = new ExezineProvider(
    http as unknown as HttpService,
    config as unknown as ConfigService,
  );
  return { provider, http };
}

const checkoutParams: CreateCheckoutParams = {
  orderId: 'order-uuid-1',
  amountMinorUnits: 499,
  currency: 'USD',
  description: 'Azerbaijan eSIM - 3GB / 7 days',
  customerEmail: 'traveler@example.com',
  returnUrl: 'https://storefront.example/checkout/return',
  notificationUrl: 'https://api.example/api/payments/webhook',
};

describe('ExezineProvider.createCheckout', () => {
  it('posts the documented checkout payload to the PSP Core endpoint', async () => {
    const { provider, http } = buildProvider();
    http.post.mockReturnValue(
      of({ data: { checkout: { token: 'tok-1', redirect_url: 'https://checkout/tok-1' } } }),
    );

    const result = await provider.createCheckout(checkoutParams);

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/ctp/api/checkouts`);
    expect(body).toEqual({
      checkout: {
        test: true,
        transaction_type: 'payment',
        settings: {
          // All four outcomes come back to the same page; it re-reads the order server-side
          // rather than believing the ?status the browser arrives with.
          success_url: checkoutParams.returnUrl,
          decline_url: checkoutParams.returnUrl,
          fail_url: checkoutParams.returnUrl,
          cancel_url: checkoutParams.returnUrl,
          notification_url: checkoutParams.notificationUrl,
          language: 'en',
        },
        order: {
          currency: 'USD',
          // The gateway expects minor units; sending 4.99 here would charge 5 cents.
          amount: 499,
          description: 'Azerbaijan eSIM - 3GB / 7 days',
          // How the webhook later tells us which order it is about.
          tracking_id: 'order-uuid-1',
        },
        customer: { email: 'traveler@example.com' },
      },
    });
    expect(result).toEqual({ token: 'tok-1', redirectUrl: 'https://checkout/tok-1' });
  });

  it('authenticates with HTTP Basic built from the shop id and secret key', async () => {
    const { provider, http } = buildProvider();
    http.post.mockReturnValue(
      of({ data: { checkout: { token: 't', redirect_url: 'https://checkout/t' } } }),
    );

    await provider.createCheckout(checkoutParams);

    const { headers } = http.post.mock.calls[0][2];
    const expected = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expected}`);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends test:false once the shop is taken live', async () => {
    const { provider, http } = buildProvider({ 'payments.exezine.testMode': false });
    http.post.mockReturnValue(
      of({ data: { checkout: { token: 't', redirect_url: 'https://checkout/t' } } }),
    );

    await provider.createCheckout(checkoutParams);

    expect(http.post.mock.calls[0][1].checkout.test).toBe(false);
  });
});

describe('ExezineProvider.getCheckoutStatus', () => {
  function stubStatus(http: { get: jest.Mock }, checkout: unknown) {
    http.get.mockReturnValue(of({ data: { checkout } }));
  }

  it('reads the authoritative status and payment details for a token', async () => {
    const { provider, http } = buildProvider();
    stubStatus(http, {
      status: 'successful',
      gateway_response: { payment: { uid: 'pay-9', amount: 499, currency: 'USD' } },
    });

    const result = await provider.getCheckoutStatus('tok-1');

    expect(http.get).toHaveBeenCalledWith(
      `${BASE_URL}/ctp/api/checkouts/tok-1`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`,
        }),
      }),
    );
    expect(result).toEqual({
      status: 'successful',
      uid: 'pay-9',
      amountMinorUnits: 499,
      currency: 'USD',
    });
  });

  it.each([
    ['successful', 'successful'],
    ['declined', 'declined'],
    ['failed', 'failed'],
    // The docs use "error" for gateway-side failures; it must not read as a decline, which
    // would tell the customer their card was refused when it never reached the issuer.
    ['error', 'failed'],
    ['pending', 'pending'],
    ['incomplete', 'pending'],
    // Anything unrecognised stays pending rather than being guessed into a terminal state.
    ['something_new', 'pending'],
  ])('maps gateway status "%s" to "%s"', async (raw, expected) => {
    const { provider, http } = buildProvider();
    stubStatus(http, { status: raw });

    await expect(provider.getCheckoutStatus('tok-1')).resolves.toMatchObject({ status: expected });
  });

  it('tolerates a checkout with no payment details yet', async () => {
    // A checkout the customer has not paid carries no gateway_response.
    const { provider, http } = buildProvider();
    stubStatus(http, { status: 'pending' });

    await expect(provider.getCheckoutStatus('tok-1')).resolves.toEqual({
      status: 'pending',
      uid: null,
      amountMinorUnits: 0,
      currency: '',
    });
  });
});

describe('ExezineProvider.verifyWebhookSignature', () => {
  const payload = Buffer.from(
    JSON.stringify({ transaction: { tracking_id: 'order-uuid-1', status: 'successful' } }),
  );

  it('accepts a notification signed by the shop key', () => {
    const { provider } = buildProvider();
    expect(provider.verifyWebhookSignature(payload, signBody(payload))).toBe(true);
  });

  it('rejects a body altered after signing', () => {
    // The attack this exists to stop: replay a genuine notification with the amount or the
    // tracking_id swapped.
    const { provider } = buildProvider();
    const signature = signBody(payload);
    const tampered = Buffer.from(
      JSON.stringify({ transaction: { tracking_id: 'someone-elses-order', status: 'successful' } }),
    );

    expect(provider.verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const { provider } = buildProvider();

    expect(provider.verifyWebhookSignature(payload, signBody(payload, other.privateKey))).toBe(
      false,
    );
  });

  it('rejects a notification with no signature header', () => {
    const { provider } = buildProvider();
    expect(provider.verifyWebhookSignature(payload, undefined)).toBe(false);
    expect(provider.verifyWebhookSignature(payload, '')).toBe(false);
  });

  it('rejects rather than throws on a malformed signature', () => {
    const { provider } = buildProvider();
    expect(provider.verifyWebhookSignature(payload, 'not-base64-!!')).toBe(false);
  });

  it('rejects everything when no public key is configured', () => {
    // Failing closed matters more than failing loudly: an unconfigured key must never be
    // read as "nothing to check, let it through".
    const { provider } = buildProvider({ 'payments.exezine.webhookPublicKey': '' });
    expect(provider.verifyWebhookSignature(payload, signBody(payload))).toBe(false);
  });

  it('verifies over the exact bytes received, not a re-serialised body', () => {
    // JSON.parse -> JSON.stringify would reorder keys and drop whitespace, breaking the
    // signature. This is why the controller reads req.rawBody.
    const rawBody = Buffer.from('{"transaction":  {"tracking_id":"order-uuid-1"}}');
    const signature = signBody(rawBody);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString())));
    const { provider } = buildProvider();

    expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true);
    expect(provider.verifyWebhookSignature(reserialised, signature)).toBe(false);
  });
});
