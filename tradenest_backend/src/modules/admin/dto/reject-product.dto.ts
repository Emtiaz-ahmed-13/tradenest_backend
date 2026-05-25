import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
