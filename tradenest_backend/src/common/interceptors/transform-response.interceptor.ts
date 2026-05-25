import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        if (this.isApiSuccessResponse(data)) {
          return data;
        }

        const payload = data as
          | { message?: string; data?: T; meta?: Record<string, unknown> }
          | T;

        const message =
          payload &&
          typeof payload === 'object' &&
          'message' in payload &&
          typeof payload.message === 'string'
            ? payload.message
            : 'Request successful';

        const responseData =
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          payload.data !== undefined
            ? (payload.data as T)
            : (data as T);

        const meta =
          payload &&
          typeof payload === 'object' &&
          'meta' in payload &&
          payload.meta &&
          typeof payload.meta === 'object'
            ? payload.meta
            : undefined;

        return {
          success: true,
          message,
          data: responseData,
          ...(meta ? { meta } : {}),
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }

  private isApiSuccessResponse(value: unknown): value is ApiSuccessResponse<T> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      (value as ApiSuccessResponse<T>).success === true &&
      'data' in value &&
      'timestamp' in value &&
      'path' in value
    );
  }
}
