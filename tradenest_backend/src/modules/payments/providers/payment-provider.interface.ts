import { PaymentStatus } from '../../../../generated/prisma/enums';

export interface PaymentInitRequest {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInitResult {
  status: PaymentStatus;
  providerRef?: string;
  transactionId?: string;
  redirectUrl?: string;
  raw?: unknown;
}

export interface PaymentVerifyRequest {
  paymentId?: string;
  providerRef?: string;
  transactionId?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentVerifyResult {
  status: PaymentStatus;
  providerRef?: string;
  transactionId?: string;
  amount?: string;
  currency?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface PaymentRefundRequest {
  paymentId: string;
  providerRef?: string;
  transactionId?: string;
  amount: string;
  currency: string;
  reason?: string;
}

export interface PaymentRefundResult {
  status: PaymentStatus;
  providerRef?: string;
  transactionId?: string;
  raw?: unknown;
}

export interface PaymentProviderAdapter {
  initPayment(request: PaymentInitRequest): Promise<PaymentInitResult>;
  verifyPayment(request: PaymentVerifyRequest): Promise<PaymentVerifyResult>;
  refundPayment(request: PaymentRefundRequest): Promise<PaymentRefundResult>;
}
