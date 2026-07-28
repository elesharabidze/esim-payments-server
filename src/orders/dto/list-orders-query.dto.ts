import { IsEmail } from 'class-validator';

export class ListOrdersQueryDto {
  @IsEmail()
  email!: string;
}
