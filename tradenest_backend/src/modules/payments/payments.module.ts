import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BkashProvider } from './providers/bkash.provider';
import { NagadProvider } from './providers/nagad.provider';
import { SslcommerzProvider } from './providers/sslcommerz.provider';
import { PaymentsWebhookController } from './webhooks/payments-webhook.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PaymentsService,
    BkashProvider,
    SslcommerzProvider,
    NagadProvider,
  ],
})
export class PaymentsModule {}
