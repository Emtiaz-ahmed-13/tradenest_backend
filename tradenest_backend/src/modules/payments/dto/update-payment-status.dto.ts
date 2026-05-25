import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentStatus } from '../../../../generated/prisma/enums';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;
}
