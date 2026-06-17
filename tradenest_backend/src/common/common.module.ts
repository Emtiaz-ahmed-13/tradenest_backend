import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './services/audit.service';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, EmailService, SmsService, RolesGuard],
  exports: [AuditService, EmailService, SmsService, RolesGuard],
})
export class CommonModule {}
