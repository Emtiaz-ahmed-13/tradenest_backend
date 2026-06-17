import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PaymentProvider } from '../dto/create-payment.dto';
import { PaymentsService } from '../payments.service';

@ApiTags('Payment Webhooks')
@AllowAnonymous()
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('bkash')
  handleBkash(@Body() payload: Record<string, unknown>) {
    return this.paymentsService.handleGatewayWebhook(
      PaymentProvider.BKASH,
      payload ?? {},
    );
  }

  @Post('sslcommerz')
  handleSslcommerz(@Body() payload: Record<string, unknown>) {
    return this.paymentsService.handleGatewayWebhook(
      PaymentProvider.SSLCOMMERZ,
      payload ?? {},
    );
  }

  @Post('nagad')
  handleNagad(@Body() payload: Record<string, unknown>) {
    return this.paymentsService.handleGatewayWebhook(
      PaymentProvider.NAGAD,
      payload ?? {},
    );
  }
}
