import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  promotions?: boolean;
}
