import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(
    @Session() session: UserSession,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getOverview(session.user.id, query);
  }

  @Get('gmv')
  getGmv(@Session() session: UserSession, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getGmv(session.user.id, query);
  }

  @Get('users')
  getUsers(@Session() session: UserSession, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getUsers(session.user.id, query);
  }
}
