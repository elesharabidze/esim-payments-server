import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from '../orders/orders.service';
import { MockProvider } from './provider/mock.provider';
import { PAYMENT_PROVIDER, PaymentProvider } from './provider/payment-provider.interface';
import { PayMockCheckoutDto } from './dto/pay-mock-checkout.dto';
import { TEST_CARDS, validateCard } from './provider/test-cards';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly mockProvider: MockProvider,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * E-XEZINE's automatic payment notification. This is the authoritative "payment
   * finished" signal - per the docs, a checkout should only be treated as paid once
   * this arrives, not from the customer's browser redirect alone. We verify the RSA
   * signature over the raw body, then re-fetch the checkout status from E-XEZINE
   * rather than trusting the webhook payload's own status field, which also protects
   * us from any ambiguity in the exact webhook payload shape.
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('content-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    if (!this.paymentProvider.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = req.body as {
      transaction?: { tracking_id?: string; token?: string };
      checkout?: { token?: string; order?: { tracking_id?: string } };
    };
    const trackingId = payload?.transaction?.tracking_id ?? payload?.checkout?.order?.tracking_id;
    const token = payload?.transaction?.token ?? payload?.checkout?.token;

    const order = trackingId
      ? await this.orders.findOne(trackingId).catch(() => null)
      : token
        ? await this.orders.findByToken(token)
        : null;

    if (!order) {
      this.logger.warn(
        `Webhook received but no matching order (trackingId=${trackingId}, token=${token})`,
      );
      return {};
    }

    await this.orders.refreshStatus(order.id);
    return {};
  }

  @Get('mock/:token')
  getMockCheckout(@Param('token') token: string) {
    return this.mockProvider.getMockCheckout(token);
  }

  /** Test cards shown on the mock hosted page, so the list lives in one place (the backend). */
  @Get('mock-test-cards')
  getTestCards() {
    return TEST_CARDS;
  }

  /**
   * Mock equivalent of submitting the card on E-XEZINE's hosted page. The card number
   * determines the outcome (test-cards.ts); a malformed or expired card is rejected as a
   * 400 card-entry error, distinct from a payment decline. The outcome is applied through
   * applyPaymentStatus() - the same path the real webhook ends up in, so provisioning and
   * the terminal-state guards behave identically - then we hand back the return URL.
   */
  @Post('mock/:token/pay')
  async payMockCheckout(@Param('token') token: string, @Body() dto: PayMockCheckoutDto) {
    const cardError = validateCard(dto);
    if (cardError) {
      throw new BadRequestException(cardError);
    }
    const { orderId, outcome, uid, redirectUrl } =
      await this.mockProvider.resolveMockCheckoutByCard(token, dto.cardNumber);
    const order = await this.orders.findOne(orderId);
    await this.orders.applyPaymentStatus(order, {
      status: outcome,
      uid,
      amountMinorUnits: order.amountMinorUnits,
      currency: order.currency,
    });
    return { redirectUrl };
  }
}
