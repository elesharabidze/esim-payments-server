import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { OrderStatus } from './order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { checkoutDescription, checkoutReturnUrl } from './checkout-details';
import { CatalogService } from '../catalog/catalog.service';
import { EsimService } from '../esim/esim.service';
import {
  CheckoutStatus,
  CheckoutStatusResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../payments/provider/payment-provider.interface';

/**
 * A checkout that is still "pending" at the provider carries no verdict yet, so it maps to
 * no order status and leaves the order where it is.
 */
const ORDER_STATUS_BY_CHECKOUT_STATUS: Record<CheckoutStatus, OrderStatus | null> = {
  pending: null,
  successful: OrderStatus.PAID,
  declined: OrderStatus.DECLINED,
  failed: OrderStatus.FAILED,
};

const TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.DECLINED,
  OrderStatus.FAILED,
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly catalog: CatalogService,
    private readonly esim: EsimService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const plan = await this.catalog.findOne(dto.planId);
    const order = this.orders.create({
      planId: plan.id,
      customerEmail: dto.customerEmail,
      status: OrderStatus.PENDING,
      amountMinorUnits: plan.priceMinorUnits,
      currency: plan.currency,
    });
    const saved = await this.orders.save(order);
    saved.plan = plan;
    return saved;
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async findByToken(token: string): Promise<Order | null> {
    return this.orders.findOne({ where: { paymentToken: token } });
  }

  findByEmail(email: string): Promise<Order[]> {
    return this.orders.find({
      where: { customerEmail: email },
      order: { createdAt: 'DESC' },
    });
  }

  async checkout(id: string): Promise<{ redirectUrl: string }> {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    const frontendUrl = this.config.get<string>('frontendUrl')!;
    const backendUrl = this.config.get<string>('backendUrl')!;

    const result = await this.paymentProvider.createCheckout({
      orderId: order.id,
      amountMinorUnits: order.amountMinorUnits,
      currency: order.currency,
      description: checkoutDescription(order.plan),
      customerEmail: order.customerEmail,
      returnUrl: checkoutReturnUrl(frontendUrl),
      notificationUrl: `${backendUrl}/api/payments/webhook`,
    });

    order.paymentToken = result.token;
    order.paymentRedirectUrl = result.redirectUrl;
    order.status = OrderStatus.AWAITING_PAYMENT;
    await this.orders.save(order);

    return { redirectUrl: result.redirectUrl };
  }

  /**
   * Re-fetches the authoritative checkout status from the payment provider and applies
   * it to the order. Called both from the webhook handler and from the frontend's return
   * page, so the order ends up correct whichever arrives first.
   */
  async refreshStatus(id: string): Promise<Order> {
    const order = await this.findOne(id);
    if (!order.paymentToken || TERMINAL_STATUSES.includes(order.status)) {
      return order;
    }

    const statusResult = await this.paymentProvider.getCheckoutStatus(order.paymentToken);
    return this.applyPaymentStatus(order, statusResult);
  }

  /**
   * Moves an order onto the verdict the payment provider reported.
   *
   * The webhook and the customer's return page routinely resolve the same checkout at the
   * same moment, so this claims the transition with a conditional UPDATE rather than a
   * read-modify-write `save()`. Exactly one caller sees a row affected and goes on to
   * provision the eSIM; the rest observe the already-applied status and simply re-read the
   * order. Without that, both would provision and the second insert would violate the unique
   * constraint on `esims.orderId`.
   */
  async applyPaymentStatus(order: Order, statusResult: CheckoutStatusResult): Promise<Order> {
    const nextStatus = ORDER_STATUS_BY_CHECKOUT_STATUS[statusResult.status];
    if (!nextStatus || order.status === nextStatus) {
      return order;
    }

    const claim = await this.orders.update(
      { id: order.id, status: Not(nextStatus) },
      {
        status: nextStatus,
        ...(statusResult.uid ? { paymentUid: statusResult.uid } : {}),
      },
    );

    if (claim.affected === 0) {
      return this.findOne(order.id);
    }

    order.status = nextStatus;
    order.paymentUid = statusResult.uid ?? order.paymentUid;

    if (nextStatus === OrderStatus.PAID) {
      order.esim = await this.esim.provisionForOrder(order);
      this.logger.log(`Order ${order.id} paid, eSIM ${order.esim.id} provisioned`);
    }

    return order;
  }
}
