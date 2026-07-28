import { luhnValid, outcomeForCard, validateCard } from './test-cards';

describe('test-cards', () => {
  describe('luhnValid', () => {
    it('accepts valid PANs with or without spaces', () => {
      expect(luhnValid('4242 4242 4242 4242')).toBe(true);
      expect(luhnValid('4000000000000002')).toBe(true);
    });

    it('rejects numbers that fail the checksum or are the wrong length', () => {
      expect(luhnValid('4242 4242 4242 4241')).toBe(false);
      expect(luhnValid('1234')).toBe(false);
      expect(luhnValid('')).toBe(false);
    });
  });

  describe('outcomeForCard', () => {
    it('maps known magic cards to their outcomes', () => {
      expect(outcomeForCard('4242 4242 4242 4242')).toBe('successful');
      expect(outcomeForCard('4000 0000 0000 0002')).toBe('declined');
      expect(outcomeForCard('4000 0000 0000 9995')).toBe('failed');
    });

    it('approves any other valid card by default', () => {
      expect(outcomeForCard('5555 5555 5555 4444')).toBe('successful');
    });
  });

  describe('validateCard', () => {
    const futureYear = new Date().getFullYear() + 1;

    it('passes a valid, unexpired card', () => {
      expect(
        validateCard({ cardNumber: '4242 4242 4242 4242', expMonth: 12, expYear: futureYear }),
      ).toBeNull();
    });

    it('rejects an invalid number', () => {
      expect(
        validateCard({ cardNumber: '4242 4242 4242 4241', expMonth: 12, expYear: futureYear }),
      ).toMatch(/invalid/i);
    });

    it('rejects an expired card', () => {
      expect(
        validateCard({ cardNumber: '4242 4242 4242 4242', expMonth: 1, expYear: 2000 }),
      ).toMatch(/expired/i);
    });
  });
});
