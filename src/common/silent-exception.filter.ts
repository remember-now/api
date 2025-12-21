import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import * as createHttpError from 'http-errors';

const PayloadTooLarge = createHttpError.PayloadTooLarge;
const UnsupportedMediaType = createHttpError.UnsupportedMediaType;

@Catch(PayloadTooLarge, UnsupportedMediaType)
export class SilentExceptionFilter implements ExceptionFilter {
  catch(exception: createHttpError.HttpError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.status || exception.statusCode || 500;

    response.status(status).json({
      statusCode: status,
      message: exception.message || 'Error',
      path: request.url,
    });
  }
}
