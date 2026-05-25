import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReturnRequestDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
