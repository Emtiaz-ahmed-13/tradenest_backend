import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PaymentProvider = {
  COD: 'COD',
  MANUAL: 'MANUAL',
  BKASH: 'BKASH',
  NAGAD: 'NAGAD',
  SSLCOMMERZ: 'SSLCOMMERZ',
} as const;

export type PaymentProvider =
  (typeof PaymentProvider)[keyof typeof PaymentProvider];

export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  @IsIn(Object.values(PaymentProvider))
  provider!: PaymentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerRef?: string;
}
