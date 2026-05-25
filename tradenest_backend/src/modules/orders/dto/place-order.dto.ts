import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PlaceOrderDto {
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
