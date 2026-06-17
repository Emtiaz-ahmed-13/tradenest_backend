import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(500)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  platform?: string;
}
