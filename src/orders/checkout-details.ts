import { Plan } from '../catalog/entities/plan.entity';

type PlanSummary = Pick<Plan, 'countryName' | 'unlimitedData' | 'dataAmountGb' | 'validityDays'>;

/**
 * The line the customer sees on the payment page. Shared because the mock provider has to
 * rebuild it from the stored order rather than from the original createCheckout() call.
 */
export function checkoutDescription(plan: PlanSummary): string {
  const planLabel = plan.unlimitedData ? 'Unlimited data' : `${plan.dataAmountGb}GB`;
  return `${plan.countryName} eSIM - ${planLabel} / ${plan.validityDays} days`;
}

/** Where the provider sends the customer back to; it appends ?token&uid&status. */
export function checkoutReturnUrl(frontendUrl: string): string {
  return `${frontendUrl}/checkout/return`;
}
