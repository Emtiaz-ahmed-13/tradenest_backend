import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SellerOnboardingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shopName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
