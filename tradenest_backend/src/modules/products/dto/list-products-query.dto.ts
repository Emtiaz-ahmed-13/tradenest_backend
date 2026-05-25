import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  ListingType,
  ProductCondition,
  ProductStatus,
} from '../../../../generated/prisma/enums';

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
