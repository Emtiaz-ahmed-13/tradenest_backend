import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Session() session: UserSession,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.list(session.user.id, query);
  }

  @Patch(':id/read')
  markRead(@Session() session: UserSession, @Param('id') id: string) {
    return this.notificationsService.markRead(session.user.id, id);
  }

  @Patch('read-all')
  markAllRead(@Session() session: UserSession) {
    return this.notificationsService.markAllRead(session.user.id);
  }

  @Get('preferences/me')
  getPreferences(@Session() session: UserSession) {
    return this.notificationsService.getPreferences(session.user.id);
  }

  @Patch('preferences/me')
  updatePreferences(
    @Session() session: UserSession,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(session.user.id, dto);
  }
}
