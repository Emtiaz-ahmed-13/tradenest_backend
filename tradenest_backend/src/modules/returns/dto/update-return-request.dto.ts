import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReturnRequestStatus } from '../../../../generated/prisma/enums';

export class UpdateReturnRequestDto {
  @IsEnum(ReturnRequestStatus)
  status!: ReturnRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
