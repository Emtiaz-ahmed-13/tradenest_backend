import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ReferralService } from './referral.service';
import { RewardReferralDto } from './dto/reward-referral.dto';
import { TrackReferralDto } from './dto/track-referral.dto';

@ApiTags('Referral')
@ApiBearerAuth()
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('code')
  generateCode(@Session() session: UserSession) {
    return this.referralService.generateCode(session.user.id);
  }

  @Get('mine')
  getMine(@Session() session: UserSession) {
    return this.referralService.getMine(session.user.id);
  }

  @Post('track')
  track(@Session() session: UserSession, @Body() dto: TrackReferralDto) {
    return this.referralService.trackReferral(session.user.id, dto);
  }

  @Post(':id/reward')
  reward(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: RewardReferralDto,
  ) {
    return this.referralService.rewardReferral(session.user.id, id, dto);
  }
}
