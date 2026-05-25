export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
  path: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: string;
  statusCode: number;
  timestamp: string;
  path: string;
  details?: unknown;
}
