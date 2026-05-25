import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  postalCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
