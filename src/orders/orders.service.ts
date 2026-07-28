import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Order } from './entities/order.entity';
import { OrderStatus } from './order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { checkoutDescription, checkoutReturnUrl } from './checkout-details';
import { CatalogService } from '../catalog/catalog.service';
import { EsimService } from '../esim/esim.service';
import {
  CheckoutStatusResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../payments/provider/payment-provider.interface';

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
    if (!order.paymentToken) {
      return order;
    }
    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.DECLINED ||
      order.status === OrderStatus.FAILED
    ) {
      return order;
    }

    const statusResult = await this.paymentProvider.getCheckoutStatus(order.paymentToken);
    return this.applyPaymentStatus(order, statusResult);
  }

  async applyPaymentStatus(order: Order, statusResult: CheckoutStatusResult): Promise<Order> {
    if (statusResult.status === 'successful') {
      if (order.status !== OrderStatus.PAID) {
        order.status = OrderStatus.PAID;
        order.paymentUid = statusResult.uid ?? order.paymentUid;
        await this.orders.save(order);
        const esim = await this.esim.provisionForOrder(order);
        order.esim = esim;
        this.logger.log(`Order ${order.id} paid, eSIM ${esim.id} provisioned`);
      }
    } else if (statusResult.status === 'declined' && order.status !== OrderStatus.DECLINED) {
      order.status = OrderStatus.DECLINED;
      await this.orders.save(order);
    } else if (statusResult.status === 'failed' && order.status !== OrderStatus.FAILED) {
      order.status = OrderStatus.FAILED;
      await this.orders.save(order);
    }
    return order;
  }
}
