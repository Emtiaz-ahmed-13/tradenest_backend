import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  body!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  attachmentUrl?: string;
}
