import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreatePresignedUploadUrlDto } from './dto/create-presigned-upload-url.dto';
import { UploadService } from './upload.service';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-url')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createPresignedUploadUrl(
    @Session() session: UserSession,
    @Body() dto: CreatePresignedUploadUrlDto,
  ) {
    return this.uploadService.createPresignedUploadUrl(session.user.id, dto);
  }
}
