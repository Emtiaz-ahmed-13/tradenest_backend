import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '../../../../generated/prisma/enums';
import {
  PaymentInitRequest,
  PaymentInitResult,
  PaymentProviderAdapter,
  PaymentRefundRequest,
  PaymentRefundResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './payment-provider.interface';

@Injectable()
export class NagadProvider implements PaymentProviderAdapter {
  constructor(private readonly configService: ConfigService) {}

  initPayment(request: PaymentInitRequest): Promise<PaymentInitResult> {
    this.assertConfigured();

    const merchantId = this.configService.get<string>('nagad.merchantId');
    const providerRef = `${request.paymentId}-${Date.now()}`;

    return Promise.resolve({
      status: PaymentStatus.PROCESSING,
      providerRef,
      raw: {
        merchantId,
        orderId: request.orderId,
        paymentId: request.paymentId,
        amount: request.amount,
        currency: request.currency,
        callbackUrl: request.callbackUrl,
        baseUrl: this.configService.get<string>('nagad.baseUrl'),
      },
    });
  }

  verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult> {
    this.assertConfigured();

    return Promise.resolve({
      status: PaymentStatus.PROCESSING,
      providerRef: request.providerRef,
      transactionId: request.transactionId,
      raw: request.raw,
    });
  }

  refundPayment(request: PaymentRefundRequest): Promise<PaymentRefundResult> {
    this.assertConfigured();

    return Promise.resolve({
      status: PaymentStatus.PROCESSING,
      providerRef: request.providerRef,
      transactionId: request.transactionId,
      raw: {
        paymentId: request.paymentId,
        amount: request.amount,
        currency: request.currency,
        reason: request.reason,
      },
    });
  }

  private assertConfigured() {
    const required = [
      this.configService.get<string>('nagad.merchantId'),
      this.configService.get<string>('nagad.merchantNumber'),
      this.configService.get<string>('nagad.publicKey'),
      this.configService.get<string>('nagad.privateKey'),
      this.configService.get<string>('nagad.baseUrl'),
    ];

    if (required.some((value) => !value)) {
      throw new ServiceUnavailableException('Nagad credentials are missing');
    }
  }
}
