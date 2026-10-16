import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { MonitoringService } from './monitoring.service';

/** Relève les erreurs serveur (500 et plus, ou erreurs inattendues) puis répond comme d'habitude. */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(private readonly monitoring: MonitoringService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const req = host.switchToHttp().getRequest<{ method?: string; originalUrl?: string; url?: string; user?: { sub?: string } }>();
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.monitoring
        .record({
          source: 'SERVER',
          message: err.message,
          stack: err.stack,
          path: req ? `${req.method ?? ''} ${(req.originalUrl ?? req.url ?? '').split('?')[0]}` : null,
          userId: req?.user?.sub ?? null,
        })
        .catch(() => undefined);
    }
    super.catch(exception, host);
  }
}
