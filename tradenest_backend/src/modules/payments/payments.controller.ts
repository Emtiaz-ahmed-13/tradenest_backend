import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InitGatewayPaymentDto } from './dto/init-gateway-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@Session() session: UserSession, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(session.user.id, dto);
  }

  @Get('mine')
  listMine(@Session() session: UserSession) {
    return this.paymentsService.listMine(session.user.id);
  }

  @Get(':id')
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.paymentsService.findOne(session.user.id, id);
  }

  @Post(':id/init-gateway')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initGateway(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: InitGatewayPaymentDto,
  ) {
    return this.paymentsService.initGatewayPayment(session.user.id, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updateStatus(session.user.id, id, dto);
  }
}
