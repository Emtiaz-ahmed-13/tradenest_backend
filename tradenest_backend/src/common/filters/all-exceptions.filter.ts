import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let error = 'InternalServerError';
    let details: unknown;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const payload = exceptionResponse as {
        message?: string | string[];
        error?: string;
      };
      message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : (payload.message ?? message);
      error = payload.error ?? error;
      details = exceptionResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const isProduction =
      this.configService.get<string>('nodeEnv') === 'production';

    const body: ApiErrorResponse = {
      success: false,
      message,
      error,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(status === HttpStatus.BAD_REQUEST && details ? { details } : {}),
      ...(!isProduction &&
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      exception instanceof Error
        ? { details: exception.stack }
        : {}),
    };

    response.status(status).json(body);
  }
}
