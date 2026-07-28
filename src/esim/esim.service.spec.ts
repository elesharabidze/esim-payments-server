import { EsimService } from './esim.service';
import { Order } from '../orders/entities/order.entity';

function luhnIsValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

describe('EsimService', () => {
  let service: EsimService;
  let saved: any;
  const repo = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => {
      saved = { id: 'esim-1', issuedAt: new Date(), ...data };
      return saved;
    }),
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EsimService(repo as any);
  });

  it('generates a 19-digit ICCID that passes the Luhn check', async () => {
    const order = { id: 'order-1' } as Order;
    const esim = await service.provisionForOrder(order);

    expect(esim.iccid).toHaveLength(19);
    expect(esim.iccid.startsWith('8901')).toBe(true);
    expect(luhnIsValid(esim.iccid)).toBe(true);
  });

  it('generates an LPA activation code and a matching QR data URL', async () => {
    const order = { id: 'order-2' } as Order;
    const esim = await service.provisionForOrder(order);

    expect(esim.activationCode).toMatch(/^LPA:1\$[^$]+\$[A-Z0-9_-]+$/);
    expect(esim.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(esim.orderId).toBe('order-2');
  });

  it('generates a different ICCID and activation code on each call', async () => {
    const order = { id: 'order-3' } as Order;
    const first = await service.provisionForOrder(order);
    const second = await service.provisionForOrder(order);

    expect(first.iccid).not.toBe(second.iccid);
    expect(first.activationCode).not.toBe(second.activationCode);
  });
});
