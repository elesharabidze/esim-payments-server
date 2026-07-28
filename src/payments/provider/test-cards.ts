export type MockOutcome = 'successful' | 'declined' | 'failed';

/**
 * Luhn checksum - the same sanity check a real gateway (and browser card forms)
 * run before a PAN is ever sent for authorization. Accepts digits with or without
 * the spaces a user typically types.
 */
export function luhnValid(pan: string): boolean {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) {
      return false;
    }
    if (double) {
      d *= 2;
      if (d > 9) {
        d -= 9;
      }
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * "Magic" test cards. Real PSPs (including E-XEZINE's test mode) map specific PANs to
 * fixed outcomes so integrators can exercise every branch without moving real money.
 * We mirror that: the card number - not a hidden button - decides the result.
 */
const OUTCOME_BY_PAN: Record<string, MockOutcome> = {
  '4242424242424242': 'successful',
  '4000000000000002': 'declined',
  '4000000000009995': 'failed',
};

export interface TestCard {
  number: string;
  outcome: MockOutcome;
  label: string;
}

export const TEST_CARDS: TestCard[] = [
  { number: '4242 4242 4242 4242', outcome: 'successful', label: 'Payment approved' },
  { number: '4000 0000 0000 0002', outcome: 'declined', label: 'Card declined' },
  { number: '4000 0000 0000 9995', outcome: 'failed', label: 'Insufficient funds' },
];

/**
 * Maps a card number to a simulated outcome. Known decline/fail cards behave as listed;
 * any other Luhn-valid number approves, so casual testing "just works". The PAN is used
 * only to derive the outcome here - it is never persisted.
 */
export function outcomeForCard(pan: string): MockOutcome {
  const digits = pan.replace(/\D/g, '');
  return OUTCOME_BY_PAN[digits] ?? 'successful';
}

/**
 * Validates the card entry itself (bad number / expired card), as distinct from a
 * payment decline. Returns a human-readable reason, or null when the card is acceptable.
 */
export function validateCard(input: {
  cardNumber: string;
  expMonth: number;
  expYear: number;
}): string | null {
  if (!luhnValid(input.cardNumber)) {
    return 'The card number is invalid.';
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (
    input.expYear < currentYear ||
    (input.expYear === currentYear && input.expMonth < currentMonth)
  ) {
    return 'The card has expired.';
  }
  return null;
}
