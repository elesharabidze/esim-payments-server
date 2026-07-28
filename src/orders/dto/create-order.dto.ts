import { IsEmail, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  planId!: string;

  @IsEmail()
  customerEmail!: string;
}
