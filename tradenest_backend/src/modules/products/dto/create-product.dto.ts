import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ListingType,
  ProductCondition,
  ProductStatus,
} from '../../../../generated/prisma/enums';
import { ProductImageDto } from './product-image.dto';

export class CreateProductDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsString()
  @MaxLength(3000)
  description!: string;

  @IsEnum(ProductCondition)
  condition!: ProductCondition;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];
}
