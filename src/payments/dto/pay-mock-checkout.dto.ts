import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * Card fields submitted to the mock hosted page. Shape validation only - the number's
 * Luhn check and the expiry check happen in the controller (see test-cards.validateCard),
 * so an invalid card is reported the way a gateway would report a card-entry error.
 */
export class PayMockCheckoutDto {
  @IsString()
  @Matches(/^[0-9 ]{12,25}$/, {
    message: 'cardNumber must contain only digits and spaces',
  })
  cardNumber!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  expYear!: number;

  @IsString()
  @Matches(/^[0-9]{3,4}$/, { message: 'cvc must be 3 or 4 digits' })
  cvc!: string;

  @IsString()
  @Length(2, 60)
  holder!: string;
}
