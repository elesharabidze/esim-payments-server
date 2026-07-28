import { IsIn } from 'class-validator';

export class SimulateMockPaymentDto {
  @IsIn(['successful', 'declined'])
  outcome!: 'successful' | 'declined';
}
