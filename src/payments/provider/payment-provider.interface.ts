export interface CreateCheckoutParams {
  orderId: string;
  amountMinorUnits: number;
  currency: string;
  description: string;
  customerEmail: string;
  /** Used for success_url/decline_url/fail_url/cancel_url - E-XEZINE appends ?token&uid&status to it. */
  returnUrl: string;
  notificationUrl: string;
}

export interface CreateCheckoutResult {
  token: string;
  redirectUrl: string;
}

export type CheckoutStatus = 'pending' | 'successful' | 'declined' | 'failed';

export interface CheckoutStatusResult {
  status: CheckoutStatus;
  uid: string | null;
  amountMinorUnits: number;
  currency: string;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentProvider {
  readonly name: 'exezine' | 'mock';
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;
  getCheckoutStatus(token: string): Promise<CheckoutStatusResult>;
  /** Returns false (and logs) when the signature is missing/invalid - callers must treat that as "reject". */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader?: string): boolean;
}
