import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
