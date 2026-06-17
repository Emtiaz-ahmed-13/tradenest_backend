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
  PaymentRefundResult,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './payment-provider.interface';

interface SslcommerzInitResponse {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  redirectGatewayURL?: string;
  directPaymentURL?: string;
}

interface SslcommerzValidationResponse {
  status?: string;
  tran_id?: string;
  val_id?: string;
  bank_tran_id?: string;
  amount?: string;
  currency?: string;
  error?: string;
  risk_level?: string;
  risk_title?: string;
}

@Injectable()
export class SslcommerzProvider implements PaymentProviderAdapter {
  private readonly sandboxBaseUrl = 'https://sandbox.sslcommerz.com';

  constructor(private readonly configService: ConfigService) {}

  async initPayment(request: PaymentInitRequest): Promise<PaymentInitResult> {
    const storeId = this.storeId;
    const storePassword = this.storePassword;

    const response = await this.postForm<SslcommerzInitResponse>(
      '/gwprocess/v4/api.php',
      {
        store_id: storeId,
        store_passwd: storePassword,
        total_amount: request.amount,
        currency: request.currency,
        tran_id: request.paymentId,
        success_url: request.callbackUrl,
        fail_url: request.callbackUrl,
        cancel_url: request.callbackUrl,
        ipn_url: request.callbackUrl,
        product_name: `TradeNest order ${request.orderId}`,
        product_category: 'Marketplace',
        product_profile: 'general',
        cus_name: request.customerName ?? 'TradeNest Customer',
        cus_email: request.customerEmail ?? 'customer@tradenest.local',
        cus_add1: 'Dhaka',
        cus_city: 'Dhaka',
        cus_country: 'Bangladesh',
        cus_phone: request.customerPhone ?? '01700000000',
        shipping_method: 'NO',
        num_of_item: '1',
      },
    );

    if (response.status !== 'SUCCESS') {
      throw new BadGatewayException(
        response.failedreason ?? 'SSLCommerz session init failed',
      );
    }

    return {
      status: PaymentStatus.PROCESSING,
      providerRef: response.sessionkey,
      redirectUrl:
        response.GatewayPageURL ??
        response.redirectGatewayURL ??
        response.directPaymentURL,
      raw: response,
    };
  }

  async verifyPayment(
    request: PaymentVerifyRequest,
  ): Promise<PaymentVerifyResult> {
    const valId = this.resolveValidationId(request);
    const response = await this.getValidation(valId);
    const status = this.mapStatus(response.status);

    return {
      status,
      providerRef: response.val_id ?? valId,
      transactionId: response.bank_tran_id ?? response.tran_id,
      amount: response.amount,
      currency: response.currency,
      failureReason:
        status === PaymentStatus.FAILED
          ? (response.error ??
            response.risk_title ??
            'SSLCommerz validation failed')
          : undefined,
      raw: response,
    };
  }

  refundPayment(): Promise<PaymentRefundResult> {
    return Promise.reject(
      new ServiceUnavailableException('SSLCommerz refund is not configured'),
    );
  }

  private async postForm<T>(
    path: string,
    body: Record<string, string | undefined>,
  ): Promise<T> {
    const form = new URLSearchParams();

    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined) {
        form.append(key, value);
      }
    });

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as T;

    if (!response.ok) {
      throw new BadGatewayException('SSLCommerz gateway request failed');
    }

    return data;
  }

  private async getValidation(
    valId: string,
  ): Promise<SslcommerzValidationResponse> {
    const params = new URLSearchParams({
      val_id: valId,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      v: '1',
      format: 'json',
    });

    const response = await fetch(
      `${this.baseUrl}/validator/api/validationserverAPI.php?${params.toString()}`,
      { headers: { accept: 'application/json' } },
    );
    const data = (await response.json().catch(() => ({}))) as
      | SslcommerzValidationResponse
      | Array<SslcommerzValidationResponse>;

    if (!response.ok) {
      throw new BadGatewayException('SSLCommerz validation request failed');
    }

    return Array.isArray(data) ? (data[0] ?? {}) : data;
  }

  private resolveValidationId(request: PaymentVerifyRequest): string {
    const rawValId = request.raw?.val_id;
    const valId =
      (typeof rawValId === 'string' ? rawValId : undefined) ??
      request.providerRef;

    if (!valId) {
      throw new ServiceUnavailableException(
        'SSLCommerz validation id is required',
      );
    }

    return valId;
  }

  private mapStatus(status?: string): PaymentStatus {
    switch (status?.toUpperCase()) {
      case 'VALID':
      case 'VALIDATED':
        return PaymentStatus.COMPLETED;
      case 'FAILED':
      case 'CANCELLED':
      case 'CANCELED':
      case 'EXPIRED':
      case 'INVALID':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.PROCESSING;
    }
  }

  private get storeId(): string {
    const storeId = this.configService.get<string>('sslcommerz.storeId');

    if (!storeId) {
      throw new ServiceUnavailableException('SSLCommerz store id is missing');
    }

    return storeId;
  }

  private get storePassword(): string {
    const storePassword = this.configService.get<string>(
      'sslcommerz.storePassword',
    );

    if (!storePassword) {
      throw new ServiceUnavailableException(
        'SSLCommerz store password is missing',
      );
    }

    return storePassword;
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('sslcommerz.baseUrl') ??
      this.sandboxBaseUrl
    ).replace(/\/$/, '');
  }
}
