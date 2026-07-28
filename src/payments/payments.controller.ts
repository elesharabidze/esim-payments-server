import {
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
import { SimulateMockPaymentDto } from './dto/simulate-mock-payment.dto';

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
    const record = this.mockProvider.getMockCheckout(token);
    return {
      token: record.token,
      orderId: record.orderId,
      amountMinorUnits: record.amountMinorUnits,
      currency: record.currency,
      description: record.description,
      status: record.status,
    };
  }

  @Post('mock/:token/simulate')
  async simulateMockCheckout(@Param('token') token: string, @Body() dto: SimulateMockPaymentDto) {
    const { record, redirectUrl } = this.mockProvider.resolveMockCheckout(token, dto.outcome);
    await this.orders.refreshStatus(record.orderId);
    return { redirectUrl };
  }
}
