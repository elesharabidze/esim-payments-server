import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Plan } from '../src/catalog/entities/plan.entity';
import { Order } from '../src/orders/entities/order.entity';
import { Esim } from '../src/esim/entities/esim.entity';

describe('eSIM purchase flow (e2e)', () => {
  let app: INestApplication;
  let planRepo: Repository<Plan>;
  let orderRepo: Repository<Order>;
  let esimRepo: Repository<Esim>;
  let plan: Plan;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true } as any);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    planRepo = moduleFixture.get(getRepositoryToken(Plan));
    orderRepo = moduleFixture.get(getRepositoryToken(Order));
    esimRepo = moduleFixture.get(getRepositoryToken(Esim));

    plan = await planRepo.save(
      planRepo.create({
        countryCode: 'ZZ',
        countryName: 'E2E Testland',
        region: 'Test',
        dataAmountGb: 1,
        validityDays: 1,
        priceMinorUnits: 100,
        currency: 'USD',
      }),
    );
  });

  afterAll(async () => {
    const orders = await orderRepo.find({ where: { planId: plan.id } });
    for (const order of orders) {
      await esimRepo.delete({ orderId: order.id });
    }
    await orderRepo.delete({ planId: plan.id });
    await planRepo.delete({ id: plan.id });
    await app.close();
  });

  it('completes a full purchase: browse -> order -> checkout -> pay -> eSIM issued', async () => {
    const server = app.getHttpServer();

    const planResponse = await request(server).get(`/api/plans/${plan.id}`).expect(200);
    expect(planResponse.body.countryName).toBe('E2E Testland');

    const orderResponse = await request(server)
      .post('/api/orders')
      .send({ planId: plan.id, customerEmail: 'e2e@example.com' })
      .expect(201);
    const orderId = orderResponse.body.id;
    expect(orderResponse.body.status).toBe('pending');

    const checkoutResponse = await request(server)
      .post(`/api/orders/${orderId}/checkout`)
      .expect(201);
    const redirectUrl: string = checkoutResponse.body.redirectUrl;
    expect(redirectUrl).toContain('/mock-checkout/');
    const token = redirectUrl.split('/mock-checkout/')[1];

    const mockCheckout = await request(server).get(`/api/payments/mock/${token}`).expect(200);
    expect(mockCheckout.body.orderId).toBe(orderId);
    expect(mockCheckout.body.amountMinorUnits).toBe(100);

    const payResponse = await request(server)
      .post(`/api/payments/mock/${token}/pay`)
      .send({
        cardNumber: '4242 4242 4242 4242',
        expMonth: 12,
        expYear: new Date().getFullYear() + 1,
        cvc: '123',
        holder: 'E2E Tester',
      })
      .expect(201);
    expect(payResponse.body.redirectUrl).toContain('status=successful');

    const finalOrder = await request(server).get(`/api/orders/${orderId}`).expect(200);
    expect(finalOrder.body.status).toBe('paid');
    expect(finalOrder.body.esim).toBeTruthy();
    expect(finalOrder.body.esim.iccid).toHaveLength(19);
    expect(finalOrder.body.esim.activationCode).toMatch(/^LPA:1\$/);
  });

  it('declines the order when the decline test card is used, and issues no eSIM', async () => {
    const server = app.getHttpServer();

    const orderId = (
      await request(server)
        .post('/api/orders')
        .send({ planId: plan.id, customerEmail: 'decline@example.com' })
        .expect(201)
    ).body.id;

    const redirectUrl: string = (
      await request(server).post(`/api/orders/${orderId}/checkout`).expect(201)
    ).body.redirectUrl;
    const token = redirectUrl.split('/mock-checkout/')[1];

    const payResponse = await request(server)
      .post(`/api/payments/mock/${token}/pay`)
      .send({
        cardNumber: '4000 0000 0000 0002',
        expMonth: 12,
        expYear: new Date().getFullYear() + 1,
        cvc: '123',
        holder: 'E2E Tester',
      })
      .expect(201);
    expect(payResponse.body.redirectUrl).toContain('status=declined');

    const finalOrder = await request(server).get(`/api/orders/${orderId}`).expect(200);
    expect(finalOrder.body.status).toBe('declined');
    expect(finalOrder.body.esim).toBeFalsy();
  });

  it('rejects an invalid card number with a 400', async () => {
    const server = app.getHttpServer();

    const orderId = (
      await request(server)
        .post('/api/orders')
        .send({ planId: plan.id, customerEmail: 'badcard@example.com' })
        .expect(201)
    ).body.id;
    const redirectUrl: string = (
      await request(server).post(`/api/orders/${orderId}/checkout`).expect(201)
    ).body.redirectUrl;
    const token = redirectUrl.split('/mock-checkout/')[1];

    await request(server)
      .post(`/api/payments/mock/${token}/pay`)
      .send({
        cardNumber: '4242 4242 4242 4241',
        expMonth: 12,
        expYear: new Date().getFullYear() + 1,
        cvc: '123',
        holder: 'E2E Tester',
      })
      .expect(400);
  });

  it('rejects an order for a non-existent plan with 404', async () => {
    await request(app.getHttpServer())
      .post('/api/orders')
      .send({ planId: '00000000-0000-0000-0000-000000000000', customerEmail: 'x@example.com' })
      .expect(404);
  });
});
