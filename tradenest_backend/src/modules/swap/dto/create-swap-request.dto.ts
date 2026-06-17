import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSwapRequestDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  offeredProductId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
