import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
