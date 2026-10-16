import { Injectable, BadRequestException, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import fetch from 'node-fetch';
import { NotificationEntity, NotificationAudience } from './entities/notification.entity';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly sitesService: SitesService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.dispatchDueScheduled().catch((err) => this.logger.warn('Erreur envoi différé', err));
    }, 60 * 1000);

    setInterval(() => {
      this.escalateUnread().catch((err) => this.logger.warn('Erreur escalade notifications', err));
    }, 5 * 60 * 1000);

    const digestHour = Number(process.env.NOTIFICATION_DIGEST_HOUR ?? '8');
    let lastDailyDigestDate: string | null = null;
    let lastWeeklyDigestDate: string | null = null;
    setInterval(() => {
      const now = new Date();
      if (now.getHours() !== digestHour) return;
      const todayKey = now.toISOString().slice(0, 10);
      if (lastDailyDigestDate !== todayKey) {
        lastDailyDigestDate = todayKey;
        this.sendDigest('daily').catch((err) => this.logger.warn('Erreur digest quotidien', err));
      }
      if (now.getDay() === 1 && lastWeeklyDigestDate !== todayKey) {
        lastWeeklyDigestDate = todayKey;
        this.sendDigest('weekly').catch((err) => this.logger.warn('Erreur digest hebdomadaire', err));
      }
    }, 5 * 60 * 1000);
  }

  /** `targetIds` restreint l'historique aux envois visant ces sites/agents (périmètre superviseur). */
  async list(page = 1, pageSize = 20, targetIds: string[] | null = null) {
    const where: Prisma.NotificationWhereInput = targetIds ? { targetId: { in: targetIds } } : {};
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async registerToken(userId: string | undefined, expoToken?: string, deviceToken?: string) {
    if (!userId) {
      throw new BadRequestException('Utilisateur requis');
    }
    const tokens = [expoToken, deviceToken].filter(Boolean) as string[];
    if (!tokens.length) {
      throw new BadRequestException('Aucun token fourni');
    }
    for (const token of tokens) {
      const existing = await this.prisma.pushToken.findUnique({ where: { token } });
      if (existing) {
        await this.prisma.pushToken.update({
          where: { token },
          data: { userId },
        });
      } else {
        await this.prisma.pushToken.create({
          data: { userId, token },
        });
      }
    }
    this.logger.log(
      `[Push] Tokens enregistrés pour ${userId}: expo=${expoToken ? 'oui' : 'non'}, fcm=${deviceToken ? 'oui' : 'non'}`,
    );
    return { success: true };
  }

  /**
   * `scopedTargets` (superviseur) : ses notifications personnelles + celles visant ses sites ou ses
   * agents ; l'admin voit tout.
   */
  async feed(user: { sub: string; role: string }, scopedTargets: string[] | null = null) {
    if (!user) {
      return [];
    }
    const notifications =
      user.role === 'SUPERVISOR' && scopedTargets
        ? await this.prisma.notification.findMany({
            where: { targetId: { in: [user.sub, ...scopedTargets] } },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : user.role === 'ADMIN' || user.role === 'SUPERVISOR'
        ? await this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
        : await this.prisma.notification.findMany({
            where: {
              OR: [
                { audience: 'ALL_AGENTS' },
                { audience: 'AGENT', targetId: user.sub },
                // SITE_AGENTS: sans mapping site/agent, on envoie tout
                { audience: 'SITE_AGENTS' },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          });

    const reads = await this.prisma.notificationRead.findMany({
      where: { userId: user.sub, notificationId: { in: notifications.map((n) => n.id) } },
    });
    const readIds = new Set(reads.map((r) => r.notificationId));
    return notifications.map((n) => ({ ...n, read: readIds.has(n.id) }));
  }

  async send(dto: SendNotificationDto) {
    let targetName: string | undefined;
    if (dto.audience === 'SITE_AGENTS') {
      if (!dto.targetId) {
        throw new BadRequestException('siteId requis');
      }
      const site = this.sitesService.findOne(dto.targetId);
      targetName = site.name;
    }
    if (dto.audience === 'AGENT') {
      if (!dto.targetId) {
        throw new BadRequestException('userId requis');
      }
      const user = this.usersService.findOne(dto.targetId);
      targetName = user?.name ?? 'Agent';
    }

    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    const isFuture = scheduledFor && scheduledFor.getTime() > Date.now();

    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        message: dto.message,
        audience: dto.audience,
        targetId: dto.targetId ?? null,
        targetName,
        category: dto.category,
        priority: dto.priority ?? 'NORMAL',
        data: dto.data as Prisma.InputJsonValue | undefined,
        scheduledFor,
        sentAt: isFuture ? null : new Date(),
        escalateAfterMinutes: dto.escalateAfterMinutes,
      },
    });
    this.auditService.record({
      actorId: 'admin@madyproclean.com',
      action: 'CREATE_NOTIFICATION',
      entityType: 'notification',
      entityId: notification.id,
      details: dto.title,
    });
    if (!isFuture) {
      this.dispatch({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        audience: notification.audience as NotificationAudience,
        targetId: notification.targetId ?? undefined,
        targetName,
        data: (notification.data as Record<string, unknown>) ?? undefined,
        createdAt: notification.createdAt,
      });
    }
    return notification;
  }

  private async dispatchDueScheduled() {
    const due = await this.prisma.notification.findMany({
      where: { sentAt: null, scheduledFor: { lte: new Date() } },
    });
    for (const notification of due) {
      await this.prisma.notification.update({ where: { id: notification.id }, data: { sentAt: new Date() } });
      this.dispatch({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        audience: notification.audience as NotificationAudience,
        targetId: notification.targetId ?? undefined,
        targetName: notification.targetName ?? undefined,
        data: (notification.data as Record<string, unknown>) ?? undefined,
        createdAt: notification.createdAt,
      });
    }
  }

  private async escalateUnread() {
    const candidates = await this.prisma.notification.findMany({
      where: {
        audience: 'AGENT',
        escalateAfterMinutes: { not: null },
        escalatedAt: null,
        sentAt: { not: null },
      },
    });
    const admins = this.usersService.findAll({ role: 'ADMIN', status: 'active', pageSize: 100 }).items;
    for (const notification of candidates) {
      if (!notification.targetId || !notification.sentAt || !notification.escalateAfterMinutes) continue;
      const dueAt = notification.sentAt.getTime() + notification.escalateAfterMinutes * 60 * 1000;
      if (Date.now() < dueAt) continue;
      const read = await this.prisma.notificationRead.findUnique({
        where: { notificationId_userId: { notificationId: notification.id, userId: notification.targetId } },
      });
      if (read) {
        await this.prisma.notification.update({ where: { id: notification.id }, data: { escalatedAt: new Date() } });
        continue;
      }
      const agent = this.usersService.findOne(notification.targetId);
      for (const admin of admins) {
        const escalation = await this.prisma.notification.create({
          data: {
            title: `⚠️ Non lue : ${notification.title}`,
            message: `${agent?.name ?? 'Un agent'} n'a pas lu « ${notification.title} » après ${notification.escalateAfterMinutes} min.`,
            audience: 'AGENT',
            targetId: admin.id,
            targetName: admin.name,
            priority: 'HIGH',
            category: 'escalation',
            sentAt: new Date(),
          },
        });
        this.dispatch({
          id: escalation.id,
          title: escalation.title,
          message: escalation.message,
          audience: 'AGENT',
          targetId: admin.id,
          targetName: admin.name,
          createdAt: escalation.createdAt,
        });
      }
      await this.prisma.notification.update({ where: { id: notification.id }, data: { escalatedAt: new Date() } });
    }
  }

  private async sendDigest(period: 'daily' | 'weekly') {
    const since = new Date(Date.now() - (period === 'daily' ? 1 : 7) * 24 * 60 * 60 * 1000);
    const agents = this.usersService.findAll({ role: 'AGENT', status: 'active', pageSize: 500 }).items;
    for (const agent of agents) {
      const unread = await this.prisma.notification.findMany({
        where: {
          createdAt: { gte: since },
          sentAt: { not: null },
          OR: [{ audience: 'ALL_AGENTS' }, { audience: 'SITE_AGENTS' }, { audience: 'AGENT', targetId: agent.id }],
          reads: { none: { userId: agent.id } },
        },
      });
      if (!unread.length) continue;
      const notification = await this.prisma.notification.create({
        data: {
          title: period === 'daily' ? 'Résumé du jour' : 'Résumé de la semaine',
          message: `${unread.length} notification(s) non lue(s) : ${unread.slice(0, 5).map((n) => n.title).join(', ')}${unread.length > 5 ? '…' : ''}`,
          audience: 'AGENT',
          targetId: agent.id,
          targetName: agent.name,
          category: 'digest',
          sentAt: new Date(),
        },
      });
      this.dispatch({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        audience: 'AGENT',
        targetId: agent.id,
        targetName: agent.name,
        createdAt: notification.createdAt,
      });
    }
  }

  /**
   * Alerte personnelle (push + fil) à chaque superviseur des sites donnés. Utilise l'audience
   * `AGENT` ciblée, seul canal qui atteint un compte précis (comme l'alerte de retard).
   */
  async notifySiteSupervisors(
    siteIds: string[],
    payload: { title: string; message: string; category?: string; data?: Record<string, unknown> },
    excludeUserIds: string[] = [],
  ) {
    if (!siteIds.length) return;
    const links = await this.prisma.siteSupervisor.findMany({
      where: { siteId: { in: siteIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    await Promise.all(
      links
        .filter((link) => !excludeUserIds.includes(link.userId))
        .map((link) =>
          this.send({ ...payload, audience: 'AGENT', targetId: link.userId } as SendNotificationDto).catch((err) =>
            this.logger.warn(`Alerte superviseur ${link.userId} échouée: ${(err as Error).message}`),
          ),
        ),
    );
  }

  /** Alerte les superviseurs de tous les sites où l'agent a déjà été affecté (son périmètre). */
  async notifyAgentSupervisors(
    agentId: string,
    payload: { title: string; message: string; category?: string; data?: Record<string, unknown> },
  ) {
    const interventions = await this.prisma.intervention.findMany({
      where: { assignments: { some: { userId: agentId } } },
      select: { siteId: true },
      distinct: ['siteId'],
    });
    await this.notifySiteSupervisors(
      interventions.map((i) => i.siteId),
      payload,
      [agentId],
    );
  }

  listTemplates() {
    return this.prisma.notificationTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  createTemplate(dto: CreateNotificationTemplateDto) {
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  async removeTemplate(id: string) {
    await this.prisma.notificationTemplate.delete({ where: { id } }).catch(() => undefined);
    return { deleted: true };
  }

  private async dispatch(notification: NotificationEntity) {
    // Récupère les tokens en fonction de l'audience
    let tokens;
    if (notification.audience === 'AGENT' && notification.targetId) {
      tokens = await this.prisma.pushToken.findMany({ where: { userId: notification.targetId } });
    } else {
      // ALL_AGENTS et SITE_AGENTS : faute de mapping agent/site fiable ici,
      // on envoie à tous les tokens enregistrés
      tokens = await this.prisma.pushToken.findMany();
    }
    if (!tokens.length) return;
    const expoTokens = tokens.map((t) => t.token).filter((t) => this.isExpoToken(t));
    const nativeTokens = tokens.map((t) => t.token).filter((t) => !this.isExpoToken(t));
    this.logger.log(
      `[Push] Dispatch notification ${notification.id} -> expo=${expoTokens.length} fcm=${nativeTokens.length}`,
    );
    this.dispatchExpo(notification, expoTokens);
    this.dispatchFcm(notification, nativeTokens);
  }

  private isExpoToken(token: string) {
    return token.startsWith('ExponentPushToken[');
  }

  private dispatchExpo(notification: NotificationEntity, tokens: string[]) {
    if (!tokens.length) return;
    const payloads = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.message,
      data: {
        ...notification.data,
        notificationId: notification.id,
      },
    }));
    const chunks: typeof payloads[] = [];
    const size = 90;
    for (let i = 0; i < payloads.length; i += size) {
      chunks.push(payloads.slice(i, i + size));
    }
    chunks.forEach(async (chunk) => {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
      } catch (error) {
        console.warn('Expo push error', error);
      }
    });
  }

  private dispatchFcm(notification: NotificationEntity, tokens: string[]) {
    if (!tokens.length) return;
    const projectId = process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const privateKey = process.env.FCM_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      console.warn('FCM v1 non configuré (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY manquant)');
      return;
    }
    this.getFcmAccessToken(clientEmail, privateKey)
      .then(async (accessToken) => {
        const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
        for (const token of tokens) {
          const payload = {
            message: {
              token,
              notification: {
                title: notification.title,
                body: notification.message,
              },
              // FCM exige des valeurs string pour data
              data: Object.fromEntries(
                Object.entries({ ...notification.data, notificationId: notification.id }).map(([k, v]) => [
                  k,
                  String(v),
                ]),
              ),
            },
          };
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const txt = await res.text();
              this.logger.warn(`[Push] FCM v1 response ${res.status}: ${txt}`);
            }
          } catch (err) {
            console.warn('FCM v1 push error', err?.message || err);
          }
        }
      })
      .catch((err) => console.warn('FCM token error', err?.message || err));
  }

  private async getFcmAccessToken(clientEmail: string, privateKey: string) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const scope = 'https://www.googleapis.com/auth/firebase.messaging';
    const payload = {
      iss: clientEmail,
      sub: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const encode = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const toSign = `${encode(header)}.${encode(payload)}`;
    const key = privateKey.replace(/\\n/g, '\n');
    const signature = crypto.createSign('RSA-SHA256').update(toSign).sign(key, 'base64url');
    const jwt = `${toSign}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OAuth token error: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new BadRequestException('Notification introuvable');
    }
    await this.prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId, userId } },
      update: {},
      create: { notificationId, userId },
    });
    return { success: true };
  }

  async getTargetId(notificationId: string): Promise<string | null> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { targetId: true },
    });
    if (!notification) throw new NotFoundException('Notification introuvable');
    return notification.targetId;
  }

  async getReadStats(notificationId: string) {
    const reads = await this.prisma.notificationRead.findMany({
      where: { notificationId },
      orderBy: { readAt: 'asc' },
    });
    return {
      notificationId,
      count: reads.length,
      readers: reads.map((r) => {
        const user = this.usersService.findOne(r.userId);
        return { id: r.userId, name: user?.name ?? 'Agent inconnu', readAt: r.readAt };
      }),
    };
  }
}
