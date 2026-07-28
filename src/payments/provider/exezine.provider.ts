import { createVerify } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  CheckoutStatusResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Talks to the real E-XEZINE PSP Core API (https://docs.e-xezine.az), a
 * BeGateway-based payment gateway. Uses the token-based payment widget /
 * hosted checkout flow: we create a checkout token server-side, redirect the
 * customer to the hosted payment page, and treat E-XEZINE's webhook as a
 * trigger to re-fetch the authoritative status (never trust the redirect
 * query params alone - see the "Payment widget" doc's fraud warning).
 */
@Injectable()
export class ExezineProvider implements PaymentProvider {
  readonly name = 'exezine' as const;
  private readonly logger = new Logger(ExezineProvider.name);

  private readonly shopId: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly webhookPublicKey: string;
  private readonly testMode: boolean;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.shopId = this.config.get<string>('payments.exezine.shopId', '');
    this.secretKey = this.config.get<string>('payments.exezine.secretKey', '');
    this.baseUrl = this.config.get<string>(
      'payments.exezine.checkoutBaseUrl',
      'https://checkout.e-xezine.az',
    );
    this.webhookPublicKey = this.config.get<string>('payments.exezine.webhookPublicKey', '');
    this.testMode = this.config.get<boolean>('payments.exezine.testMode', true);
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const body = {
      checkout: {
        test: this.testMode,
        transaction_type: 'payment',
        settings: {
          success_url: params.returnUrl,
          decline_url: params.returnUrl,
          fail_url: params.returnUrl,
          cancel_url: params.returnUrl,
          notification_url: params.notificationUrl,
          language: 'en',
        },
        order: {
          currency: params.currency,
          amount: params.amountMinorUnits,
          description: params.description,
          tracking_id: params.orderId,
        },
        customer: {
          email: params.customerEmail,
        },
      },
    };

    const response = await firstValueFrom(
      this.http.post<{ checkout: { token: string; redirect_url: string } }>(
        `${this.baseUrl}/ctp/api/checkouts`,
        body,
        {
          headers: {
            Authorization: this.authHeader(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      ),
    );

    return {
      token: response.data.checkout.token,
      redirectUrl: response.data.checkout.redirect_url,
    };
  }

  async getCheckoutStatus(token: string): Promise<CheckoutStatusResult> {
    const response = await firstValueFrom(
      this.http.get<{
        checkout: {
          status: string;
          gateway_response?: { payment?: { uid?: string; amount?: number; currency?: string } };
        };
      }>(`${this.baseUrl}/ctp/api/checkouts/${token}`, {
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
      }),
    );

    const { checkout } = response.data;
    const payment = checkout.gateway_response?.payment;

    return {
      status: this.mapStatus(checkout.status),
      uid: payment?.uid ?? null,
      amountMinorUnits: payment?.amount ?? 0,
      currency: payment?.currency ?? '',
    };
  }

  private mapStatus(raw: string): CheckoutStatusResult['status'] {
    if (raw === 'successful') return 'successful';
    if (raw === 'declined') return 'declined';
    if (raw === 'failed' || raw === 'error') return 'failed';
    return 'pending';
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader?: string): boolean {
    if (!signatureHeader) {
      this.logger.warn('Rejected webhook: missing Content-Signature header');
      return false;
    }
    if (!this.webhookPublicKey) {
      this.logger.warn('Rejected webhook: EXEZINE_WEBHOOK_PUBLIC_KEY is not configured');
      return false;
    }
    try {
      const verifier = createVerify('RSA-SHA256');
      verifier.update(rawBody);
      verifier.end();
      return verifier.verify(this.webhookPublicKey, signatureHeader, 'base64');
    } catch (err) {
      this.logger.warn(`Webhook signature verification error: ${(err as Error).message}`);
      return false;
    }
  }
}
