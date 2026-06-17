import { IsNumber, IsOptional, Min } from 'class-validator';

export class RewardReferralDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}
