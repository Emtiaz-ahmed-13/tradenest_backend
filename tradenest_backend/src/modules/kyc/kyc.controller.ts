import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { KycService } from './kyc.service';

@ApiTags('KYC')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post()
  submit(@Session() session: UserSession, @Body() dto: SubmitKycDto) {
    return this.kycService.submit(session.user.id, dto);
  }

  @Get('status')
  getStatus(@Session() session: UserSession) {
    return this.kycService.getStatus(session.user.id);
  }

  @Patch(':id/approve')
  approve(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kycService.approve(session.user.id, id, dto);
  }

  @Patch(':id/reject')
  reject(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
  ) {
    return this.kycService.reject(session.user.id, id, dto);
  }
}
