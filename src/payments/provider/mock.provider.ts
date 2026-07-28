import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutStatusResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProvider,
} from './payment-provider.interface';
import { MockOutcome, outcomeForCard } from './test-cards';

interface MockCheckoutRecord {
  token: string;
  orderId: string;
  amountMinorUnits: number;
  currency: string;
  description: string;
  status: CheckoutStatusResult['status'];
  uid: string | null;
  returnUrl: string;
}

/**
 * Stands in for the real E-XEZINE PSP when no sandbox credentials are configured
 * (PAYMENT_PROVIDER=mock, the default). Implements the exact same contract as
 * ExezineProvider - createCheckout() returns a token + redirectUrl, and the
 * "redirectUrl" points back into this app's own /mock-checkout/:token page so a
 * developer can pick "successful" or "declined" the same way a real cardholder
 * would interact with the hosted payment page. Swapping to the real provider later
 * requires no frontend or OrdersService changes.
 */
@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockProvider.name);
  private readonly checkouts = new Map<string, MockCheckoutRecord>();
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.frontendUrl = this.config.get<string>('frontendUrl', 'http://localhost:5173');
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const token = randomUUID();
    this.checkouts.set(token, {
      token,
      orderId: params.orderId,
      amountMinorUnits: params.amountMinorUnits,
      currency: params.currency,
      description: params.description,
      status: 'pending',
      uid: null,
      returnUrl: params.returnUrl,
    });

    return {
      token,
      redirectUrl: `${this.frontendUrl}/mock-checkout/${token}`,
    };
  }

  async getCheckoutStatus(token: string): Promise<CheckoutStatusResult> {
    const record = this.checkouts.get(token);
    if (!record) {
      throw new NotFoundException(`Unknown mock checkout token ${token}`);
    }
    return {
      status: record.status,
      uid: record.uid,
      amountMinorUnits: record.amountMinorUnits,
      currency: record.currency,
    };
  }

  /** Mock provider has no real signature to check - webhooks are simulated in-process instead. */
  verifyWebhookSignature(): boolean {
    return true;
  }

  getMockCheckout(token: string): MockCheckoutRecord {
    const record = this.checkouts.get(token);
    if (!record) {
      throw new NotFoundException(`Unknown mock checkout token ${token}`);
    }
    return record;
  }

  /**
   * Resolves a checkout from a submitted card number, the way the real hosted page would:
   * the PAN maps to an outcome (see test-cards.ts) and is then discarded. Card data is
   * never stored on the record - mirroring the PCI rule that it must not touch merchant
   * storage - only the derived status and a generated uid are kept.
   */
  resolveMockCheckoutByCard(
    token: string,
    cardNumber: string,
  ): { record: MockCheckoutRecord; redirectUrl: string } {
    return this.resolveMockCheckout(token, outcomeForCard(cardNumber));
  }

  resolveMockCheckout(
    token: string,
    outcome: MockOutcome,
  ): { record: MockCheckoutRecord; redirectUrl: string } {
    const record = this.getMockCheckout(token);
    record.status = outcome;
    record.uid = randomUUID();
    this.logger.log(`Mock checkout ${token} resolved as "${outcome}"`);

    const redirectUrl = new URL(record.returnUrl);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('uid', record.uid);
    redirectUrl.searchParams.set('status', outcome);

    return { record, redirectUrl: redirectUrl.toString() };
  }
}
