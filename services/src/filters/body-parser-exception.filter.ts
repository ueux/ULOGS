import { ArgumentsHost, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

type BodyParserError = Error & {
  expected?: number;
  length?: number;
  limit?: number;
  status?: number;
  statusCode?: number;
  type?: string;
};

export class BodyParserExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(exception: BodyParserError, host: ArgumentsHost) {
    if (exception?.type !== 'entity.too.large') {
      return super.catch(exception, host);
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'Request payload is too large.',
      error: 'Payload Too Large',
    });
  }
}
