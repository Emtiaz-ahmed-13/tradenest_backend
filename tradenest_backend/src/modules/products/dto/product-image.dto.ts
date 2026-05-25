import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductImageDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  alt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
