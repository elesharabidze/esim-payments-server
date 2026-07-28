import { randomUUID } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { OrderStatus } from '../../orders/order-status.enum';
import { checkoutDescription, checkoutReturnUrl } from '../../orders/checkout-details';
import {
  CheckoutStatus,
  CheckoutStatusResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentProvider,
} from './payment-provider.interface';
import { MockOutcome, outcomeForCard } from './test-cards';

export interface MockCheckoutRecord {
  token: string;
  orderId: string;
  amountMinorUnits: number;
  currency: string;
  description: string;
  status: CheckoutStatus;
}

export interface ResolvedMockCheckout {
  orderId: string;
  outcome: MockOutcome;
  uid: string;
  redirectUrl: string;
}

function checkoutStatusForOrder(status: OrderStatus): CheckoutStatus {
  switch (status) {
    case OrderStatus.PAID:
      return 'successful';
    case OrderStatus.DECLINED:
      return 'declined';
    case OrderStatus.FAILED:
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Stands in for the real E-XEZINE PSP when no sandbox credentials are configured
 * (PAYMENT_PROVIDER=mock, the default). Implements the exact same contract as
 * ExezineProvider - createCheckout() returns a token + redirectUrl, and the
 * "redirectUrl" points back into this app's own /mock-checkout/:token page so a
 * developer enters a card the same way a real cardholder would.
 *
 * State lives in the orders table, not in this instance. A real PSP is a separate
 * durable system, and on serverless the process that creates a checkout is usually
 * not the one that later reads it back, so an in-memory store loses the token
 * between requests. The order row already carries everything a checkout needs:
 * paymentToken identifies it, and the amount, currency, uid and status are columns.
 * The description and return URL are rebuilt deterministically from the same
 * helpers OrdersService used to create them.
 */
@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockProvider.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {
    this.frontendUrl = this.config.get<string>('frontendUrl', 'http://localhost:5173');
  }

  /**
   * Mints the token only. OrdersService.checkout() persists it onto the order
   * immediately afterwards, which is what makes the checkout durable.
   */
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const token = randomUUID();
    this.logger.log(`Mock checkout ${token} created for order ${params.orderId}`);
    return {
      token,
      redirectUrl: `${this.frontendUrl}/mock-checkout/${token}`,
    };
  }

  async getCheckoutStatus(token: string): Promise<CheckoutStatusResult> {
    const order = await this.loadOrder(token);
    return {
      status: checkoutStatusForOrder(order.status),
      uid: order.paymentUid ?? null,
      amountMinorUnits: order.amountMinorUnits,
      currency: order.currency,
    };
  }

  /** Mock provider has no real signature to check - webhooks are simulated in-process instead. */
  verifyWebhookSignature(): boolean {
    return true;
  }

  async getMockCheckout(token: string): Promise<MockCheckoutRecord> {
    const order = await this.loadOrder(token);
    return {
      token,
      orderId: order.id,
      amountMinorUnits: order.amountMinorUnits,
      currency: order.currency,
      description: checkoutDescription(order.plan),
      status: checkoutStatusForOrder(order.status),
    };
  }

  /**
   * Resolves a checkout from a submitted card number, the way the real hosted page would:
   * the PAN maps to an outcome (see test-cards.ts) and is then discarded. Card data is
   * never stored - mirroring the PCI rule that it must not touch merchant storage - only
   * the derived outcome and a generated uid are handed back to the caller, which applies
   * them to the order through the same path the real webhook uses.
   */
  async resolveMockCheckoutByCard(
    token: string,
    cardNumber: string,
  ): Promise<ResolvedMockCheckout> {
    return this.resolveMockCheckout(token, outcomeForCard(cardNumber));
  }

  async resolveMockCheckout(token: string, outcome: MockOutcome): Promise<ResolvedMockCheckout> {
    const order = await this.loadOrder(token);
    const uid = randomUUID();
    this.logger.log(`Mock checkout ${token} resolved as "${outcome}"`);

    const redirectUrl = new URL(checkoutReturnUrl(this.frontendUrl));
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('uid', uid);
    redirectUrl.searchParams.set('status', outcome);

    return { orderId: order.id, outcome, uid, redirectUrl: redirectUrl.toString() };
  }

  private async loadOrder(token: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { paymentToken: token } });
    if (!order) {
      throw new NotFoundException(`Unknown mock checkout token ${token}`);
    }
    return order;
  }
}
