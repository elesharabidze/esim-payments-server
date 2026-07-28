import { randomBytes, randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { Esim } from './entities/esim.entity';
import { Order } from '../orders/entities/order.entity';

const RSP_SMDP_ADDRESS = 'rsp.esim-demo.example.com';

@Injectable()
export class EsimService {
  constructor(
    @InjectRepository(Esim)
    private readonly esims: Repository<Esim>,
  ) {}

  /**
   * Simulates provisioning a physical eSIM profile with a mobile network operator.
   * Generates a Luhn-valid ICCID and a standard LPA activation string, then renders
   * the activation string as a scannable QR code (this is a demo project - there is
   * no real MNO/SM-DP+ behind this, E-XEZINE only handles the payment).
   */
  async provisionForOrder(order: Order): Promise<Esim> {
    const iccid = this.generateIccid();
    const activationCode = this.generateActivationCode();
    const qrCodeDataUrl = await QRCode.toDataURL(activationCode, { margin: 1, width: 320 });

    const esim = this.esims.create({
      orderId: order.id,
      iccid,
      activationCode,
      qrCodeDataUrl,
    });
    return this.esims.save(esim);
  }

  findByOrderId(orderId: string): Promise<Esim | null> {
    return this.esims.findOne({ where: { orderId } });
  }

  private generateIccid(): string {
    // ICCID: 89 (telecom) + 01 (test issuer) + 15 random digits + Luhn check digit = 19 digits.
    const prefix = '8901';
    let body = prefix;
    for (let i = 0; i < 14; i++) {
      body += randomInt(0, 10).toString();
    }
    return body + this.luhnCheckDigit(body);
  }

  private luhnCheckDigit(digits: string): string {
    let sum = 0;
    let double = true;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = parseInt(digits[i], 10);
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }

  private generateActivationCode(): string {
    const matchingId = randomBytes(12).toString('base64url').toUpperCase();
    return `LPA:1$${RSP_SMDP_ADDRESS}$${matchingId}`;
  }
}
