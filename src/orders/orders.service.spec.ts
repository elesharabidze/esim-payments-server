import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from './order-status.enum';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: any;
  let catalog: any;
  let esim: any;
  let config: any;
  let paymentProvider: any;

  const plan = {
    id: 'plan-1',
    countryName: 'Azerbaijan',
    dataAmountGb: 3,
    unlimitedData: false,
    validityDays: 7,
    priceMinorUnits: 499,
    currency: 'USD',
  };

  beforeEach(() => {
    ordersRepo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (order) => order),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    catalog = { findOne: jest.fn(async () => plan) };
    esim = {
      provisionForOrder: jest.fn(async (order: any) => ({ id: 'esim-1', orderId: order.id })),
    };
    config = { get: (key: string) => ({ frontendUrl: 'http://fe', backendUrl: 'http://be' })[key] };
    paymentProvider = {
      createCheckout: jest.fn(async () => ({
        token: 'tok-1',
        redirectUrl: 'http://fe/mock-checkout/tok-1',
      })),
      getCheckoutStatus: jest.fn(),
    };

    service = new OrdersService(ordersRepo, catalog, esim, config, paymentProvider);
  });

  it('creates an order priced from the plan', async () => {
    const order = await service.create({ planId: 'plan-1', customerEmail: 'a@b.com' } as any);
    expect(order.amountMinorUnits).toBe(499);
    expect(order.currency).toBe('USD');
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('rejects checkout on an already-paid order', async () => {
    ordersRepo.findOne.mockResolvedValue({ id: 'o1', status: OrderStatus.PAID, plan });
    await expect(service.checkout('o1')).rejects.toThrow(BadRequestException);
  });

  it('moves an order to awaiting_payment and stores the payment token on checkout', async () => {
    ordersRepo.findOne.mockResolvedValue({ id: 'o1', status: OrderStatus.PENDING, plan });
    const result = await service.checkout('o1');

    expect(result.redirectUrl).toBe('http://fe/mock-checkout/tok-1');
    expect(paymentProvider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'o1',
        description: expect.stringContaining('Azerbaijan'),
        returnUrl: 'http://fe/checkout/return',
        notificationUrl: 'http://be/api/payments/webhook',
      }),
    );
    const savedOrder = ordersRepo.save.mock.calls[0][0];
    expect(savedOrder.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(savedOrder.paymentToken).toBe('tok-1');
  });

  it('marks an order paid and provisions an eSIM exactly once on a successful status', async () => {
    const order: any = { id: 'o1', status: OrderStatus.AWAITING_PAYMENT };

    await service.applyPaymentStatus(order, {
      status: 'successful',
      uid: 'uid-1',
      amountMinorUnits: 499,
      currency: 'USD',
    });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(esim.provisionForOrder).toHaveBeenCalledTimes(1);

    // Re-applying a "successful" status must not re-provision.
    await service.applyPaymentStatus(order, {
      status: 'successful',
      uid: 'uid-1',
      amountMinorUnits: 499,
      currency: 'USD',
    });
    expect(esim.provisionForOrder).toHaveBeenCalledTimes(1);
  });

  it('marks an order declined without provisioning an eSIM', async () => {
    const order: any = { id: 'o1', status: OrderStatus.AWAITING_PAYMENT };
    await service.applyPaymentStatus(order, {
      status: 'declined',
      uid: null,
      amountMinorUnits: 499,
      currency: 'USD',
    });
    expect(order.status).toBe(OrderStatus.DECLINED);
    expect(esim.provisionForOrder).not.toHaveBeenCalled();
  });

  it('refreshStatus is a no-op once the order is already in a terminal state', async () => {
    ordersRepo.findOne.mockResolvedValue({
      id: 'o1',
      status: OrderStatus.PAID,
      paymentToken: 'tok-1',
    });
    await service.refreshStatus('o1');
    expect(paymentProvider.getCheckoutStatus).not.toHaveBeenCalled();
  });
});
