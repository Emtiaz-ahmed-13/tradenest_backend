import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class FlashSaleProductDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  stockLimit?: number;
}
