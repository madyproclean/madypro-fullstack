import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export type ErrorSource = 'SERVER' | 'WEB' | 'MOBILE';
export type ErrorReport = {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  path?: string | null;
  userId?: string | null;
  appVersion?: string | null;
};

/**
 * Journal des erreurs (serveur, site web, application) : chaque erreur est regroupée par empreinte
 * et comptée ; une nouvelle erreur prévient les administrateurs dans l'application.
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Même erreur = même message (chiffres et identifiants ignorés) au même endroit du code. */
  static fingerprint(report: Pick<ErrorReport, 'source' | 'message' | 'stack'>) {
    const normalized = report.message.replace(/[0-9a-f]{20,}/gi, '#').replace(/\d+/g, '#').slice(0, 300);
    const frame = (report.stack ?? '').split('\n').find((line) => /\bat\b|@/.test(line))?.trim() ?? '';
    return createHash('sha1').update(`${report.source}|${normalized}|${frame.replace(/:\d+:\d+/g, '')}`).digest('hex');
  }

  async record(report: ErrorReport) {
    const message = (report.message || 'Erreur inconnue').slice(0, 2000);
    const fingerprint = MonitoringService.fingerprint({ ...report, message });
    try {
      const existing = await this.prisma.errorEvent.findUnique({ where: { fingerprint } });
      if (existing) {
        await this.prisma.errorEvent.update({
          where: { fingerprint },
          data: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, path: report.path ?? existing.path },
        });
        return { fingerprint, isNew: false };
      }
      await this.prisma.errorEvent.create({
        data: {
          fingerprint,
          source: report.source,
          message,
          stack: report.stack?.slice(0, 8000) ?? null,
          path: report.path?.slice(0, 500) ?? null,
          userId: report.userId ?? null,
          appVersion: report.appVersion?.slice(0, 50) ?? null,
        },
      });
      await this.alertAdmins(report.source, message);
      return { fingerprint, isNew: true };
    } catch (err) {
      // Le journal ne doit jamais provoquer lui-même d'erreur visible.
      this.logger.warn(`Erreur non journalisée (${(err as Error).message}) : ${message}`);
      return { fingerprint, isNew: false };
    }
  }

  private async alertAdmins(source: ErrorSource, message: string) {
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    const where = source === 'SERVER' ? 'le serveur' : source === 'WEB' ? 'le site web' : "l'application mobile";
    await Promise.all(
      admins.map((a) =>
        this.notifications
          .send({
            audience: 'AGENT',
            targetId: a.id,
            title: 'Nouvelle erreur technique',
            message: `Sur ${where} : ${message.slice(0, 140)}`,
            category: 'monitoring',
          } as any)
          .catch(() => undefined),
      ),
    );
  }

  async list(includeResolved = false) {
    return this.prisma.errorEvent.findMany({
      where: includeResolved ? {} : { resolvedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });
  }

  resolve(id: string) {
    return this.prisma.errorEvent.update({ where: { id }, data: { resolvedAt: new Date() } });
  }
}
