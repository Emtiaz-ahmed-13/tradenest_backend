import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
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

interface BkashTokenResponse {
  id_token?: string;
  token_type?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface BkashPaymentResponse {
  paymentID?: string;
  bkashURL?: string;
  transactionStatus?: string;
  trxID?: string;
  amount?: string;
  currency?: string;
  statusCode?: string;
  statusMessage?: string;
}

@Injectable()
export class BkashProvider implements PaymentProviderAdapter {
  private readonly defaultBaseUrl =
    'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout';

  constructor(private readonly configService: ConfigService) {}

  async initPayment(request: PaymentInitRequest): Promise<PaymentInitResult> {
    const token = await this.grantToken();
    const response = await this.post<BkashPaymentResponse>(
      '/create',
      {
        mode: '0011',
        payerReference: request.customerPhone ?? request.paymentId,
        callbackURL: request.callbackUrl,
        amount: request.amount,
        currency: request.currency,
        intent: 'sale',
        merchantInvoiceNumber: request.orderId,
      },
      token,
    );

    this.assertSuccessful(response, 'bKash payment creation failed');

    return {
      status: PaymentStatus.PROCESSING,
      providerRef: response.paymentID,
      redirectUrl: response.bkashURL,
      raw: response,
    };
  }

  async verifyPayment(
    request: PaymentVerifyRequest,
  ): Promise<PaymentVerifyResult> {
    const paymentId = this.resolvePaymentId(request);
    const token = await this.grantToken();
    const executed = await this.post<BkashPaymentResponse>(
      '/execute',
      { paymentID: paymentId },
      token,
    );

    if (executed.statusCode && executed.statusCode !== '0000') {
      return {
        status: PaymentStatus.FAILED,
        providerRef: paymentId,
        failureReason: executed.statusMessage ?? 'bKash execution failed',
        raw: executed,
      };
    }

    const queried = await this.queryPayment(paymentId, token);
    const transactionStatus =
      queried.transactionStatus ?? executed.transactionStatus;

    return {
      status: this.mapStatus(transactionStatus),
      providerRef: queried.paymentID ?? executed.paymentID ?? paymentId,
      transactionId: queried.trxID ?? executed.trxID,
      amount: queried.amount ?? executed.amount,
      currency: queried.currency ?? executed.currency,
      failureReason:
        this.mapStatus(transactionStatus) === PaymentStatus.FAILED
          ? (queried.statusMessage ?? executed.statusMessage)
          : undefined,
      raw: { executed, queried },
    };
  }

  async refundPayment(
    request: PaymentRefundRequest,
  ): Promise<PaymentRefundResult> {
    if (!request.transactionId) {
      throw new ServiceUnavailableException(
        'bKash transaction id is required for refund',
      );
    }

    const token = await this.grantToken();
    const response = await this.post<BkashPaymentResponse>(
      '/payment/refund',
      {
        paymentID: request.providerRef,
        trxID: request.transactionId,
        amount: request.amount,
        reason: request.reason ?? 'TradeNest refund',
        sku: request.paymentId,
      },
      token,
    );

    this.assertSuccessful(response, 'bKash refund failed');

    return {
      status: PaymentStatus.REFUNDED,
      providerRef: response.paymentID ?? request.providerRef,
      transactionId: response.trxID ?? request.transactionId,
      raw: response,
    };
  }

  private async grantToken(): Promise<string> {
    const appKey = this.configService.get<string>('bkash.appKey');
    const appSecret = this.configService.get<string>('bkash.appSecret');
    const username = this.configService.get<string>('bkash.username');
    const password = this.configService.get<string>('bkash.password');

    if (!appKey || !appSecret || !username || !password) {
      throw new ServiceUnavailableException('bKash credentials are missing');
    }

    const response = await this.post<BkashTokenResponse>(
      '/token/grant',
      {
        app_key: appKey,
        app_secret: appSecret,
      },
      undefined,
      {
        username,
        password,
      },
    );

    if (!response.id_token) {
      throw new BadGatewayException(
        response.statusMessage ?? 'bKash token grant failed',
      );
    }

    return response.id_token;
  }

  private async queryPayment(
    paymentId: string,
    token: string,
  ): Promise<BkashPaymentResponse> {
    const response = await this.post<BkashPaymentResponse>(
      '/payment/status',
      { paymentID: paymentId },
      token,
    );

    this.assertSuccessful(response, 'bKash payment query failed');

    return response;
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    token?: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: token } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as T;

    if (!response.ok) {
      throw new BadGatewayException('bKash gateway request failed');
    }

    return data;
  }

  private assertSuccessful(
    response: BkashPaymentResponse,
    fallbackMessage: string,
  ) {
    if (response.statusCode && response.statusCode !== '0000') {
      throw new BadGatewayException(response.statusMessage ?? fallbackMessage);
    }
  }

  private resolvePaymentId(request: PaymentVerifyRequest): string {
    const rawPaymentId = request.raw?.paymentID;
    const paymentId =
      request.providerRef ??
      request.paymentId ??
      (typeof rawPaymentId === 'string' ? rawPaymentId : undefined);

    if (!paymentId) {
      throw new ServiceUnavailableException('bKash payment id is required');
    }

    return paymentId;
  }

  private mapStatus(status?: string): PaymentStatus {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'success':
      case 'succeeded':
        return PaymentStatus.COMPLETED;
      case 'failed':
      case 'cancelled':
      case 'canceled':
      case 'expired':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PROCESSING;
    }
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('bkash.baseUrl') ?? this.defaultBaseUrl
    ).replace(/\/$/, '');
  }
}
