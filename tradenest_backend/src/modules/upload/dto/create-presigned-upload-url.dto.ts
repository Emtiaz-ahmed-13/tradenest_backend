import {
  IsEnum,
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum UploadPurpose {
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  AVATAR = 'AVATAR',
  KYC_DOCUMENT = 'KYC_DOCUMENT',
}

export class CreatePresignedUploadUrlDto {
  @IsEnum(UploadPurpose)
  purpose!: UploadPurpose;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  fileName!: string;

  @IsMimeType()
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;
}
