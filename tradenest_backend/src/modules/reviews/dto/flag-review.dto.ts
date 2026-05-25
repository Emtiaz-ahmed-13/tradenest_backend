import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FlagReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
