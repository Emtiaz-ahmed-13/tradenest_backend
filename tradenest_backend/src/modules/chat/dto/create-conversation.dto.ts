import { IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  participantId!: string;

  @IsOptional()
  @IsString()
  productId?: string;
}
