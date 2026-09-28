import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

export type ApprovalActionType =
  | 'CREATE_INTERVENTION'
  | 'UPDATE_INTERVENTION_SCHEDULE'
  | 'ASSIGN_AGENT'
  | 'UNASSIGN_AGENT'
  | 'CANCEL_INTERVENTION'
  | 'CREATE_TEMPLATE_BATCH'
  | 'VALIDATE_TEMPLATE';

export type CreateApprovalRequestInput = {
  actionType: ApprovalActionType;
  entityType: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  previousState?: Record<string, unknown> | null;
  /** Absent pour une proposition générée automatiquement (aucun humain à l'origine). */
  requestedById?: string | null;
  summary: string;
};

const ACTION_LABELS: Record<ApprovalActionType, string> = {
  CREATE_INTERVENTION: 'Création d’intervention',
  UPDATE_INTERVENTION_SCHEDULE: 'Modification d’horaire',
  ASSIGN_AGENT: 'Ajout d’agent',
  UNASSIGN_AGENT: 'Retrait d’agent',
  CANCEL_INTERVENTION: 'Annulation d’intervention',
  CREATE_TEMPLATE_BATCH: 'Génération d’un lot d’interventions',
  VALIDATE_TEMPLATE: 'Validation d’un gabarit',
};

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async createRequest(input: CreateApprovalRequestInput) {
    if (input.entityId) {
      await this.prisma.approvalRequest.updateMany({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
          actionType: input.actionType,
          status: 'PENDING',
        },
        data: { status: 'SUPERSEDED' },
      });
    }

    const request = await this.prisma.approvalRequest.create({
      data: {
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        payload: input.payload as any,
        previousState: (input.previousState ?? null) as any,
        requestedById: input.requestedById ?? null,
      },
    });

    const requester = input.requestedById ? this.usersService.findOne(input.requestedById) : null;
    this.auditService.record({
      actorId: input.requestedById ?? 'system',
      action: 'CREATE_APPROVAL_REQUEST',
      entityType: input.entityType,
      entityId: input.entityId ?? request.id,
      details: `${ACTION_LABELS[input.actionType]} : ${input.summary}`,
    });
    // Notification uniquement pour une demande initiée par un humain (superviseur) : le feed
    // remonte quand même la demande à tous les admins (voir NotificationsService.feed(), qui ne
    // filtre pas par audience/targetId pour ADMIN/SUPERVISOR). Pour une génération automatique,
    // pas de destinataire pertinent via ce canal orienté agents (AGENT/SITE_AGENTS/ALL_AGENTS
    // toucherait les agents mobiles à tort) : la page "Demandes de validation" suffit à la rendre
    // visible côté admin.
    if (input.requestedById) {
      try {
        await this.notifications.send({
          audience: 'AGENT',
          targetId: input.requestedById,
          title: 'Nouvelle demande de validation',
          message: `${requester?.name ?? 'Un superviseur'} demande : ${ACTION_LABELS[input.actionType]} — ${input.summary}`,
          category: 'approval',
        });
      } catch (err) {
        this.logger.warn(`Notification de demande d'approbation échouée: ${(err as Error).message}`);
      }
    }

    return request;
  }

  async findPending(id: string) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Demande introuvable');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }
    return request;
  }

  async markApproved(id: string, reviewerId: string) {
    const request = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
    });
    this.auditService.record({
      actorId: reviewerId,
      action: 'APPROVE_REQUEST',
      entityType: request.entityType,
      entityId: request.entityId ?? request.id,
      details: ACTION_LABELS[request.actionType as ApprovalActionType],
    });
    await this.notifyRequester(request.requestedById, 'Demande approuvée', `Votre demande (${ACTION_LABELS[request.actionType as ApprovalActionType]}) a été approuvée.`);
    return request;
  }

  async markRejected(id: string, reviewerId: string | null, comment: string) {
    const request = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), reviewComment: comment },
    });
    this.auditService.record({
      actorId: reviewerId ?? 'system',
      action: 'REJECT_REQUEST',
      entityType: request.entityType,
      entityId: request.entityId ?? request.id,
      details: comment,
    });
    await this.notifyRequester(
      request.requestedById,
      'Demande refusée',
      `Votre demande (${ACTION_LABELS[request.actionType as ApprovalActionType]}) a été refusée : ${comment}`,
    );
    return request;
  }

  private async notifyRequester(userId: string | null, title: string, message: string) {
    if (!userId) return;
    try {
      await this.notifications.send({
        audience: 'AGENT',
        targetId: userId,
        title,
        message,
        category: 'approval',
      });
    } catch (err) {
      this.logger.warn(`Notification de décision d'approbation échouée: ${(err as Error).message}`);
    }
  }

  async list(filters: { status?: string; requestedById?: string; entityType?: string; page?: number; pageSize?: number } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.requestedById) where.requestedById = filters.requestedById;
    if (filters.entityType) where.entityType = filters.entityType;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const [items, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    const summaries = await this.describeInterventionRequests(items);
    const withNames = items.map((item) => ({
      ...item,
      requestedByName: item.requestedById
        ? this.usersService.findOne(item.requestedById)?.name ?? item.requestedById
        : 'Génération automatique',
      reviewedByName: item.reviewedById ? this.usersService.findOne(item.reviewedById)?.name ?? item.reviewedById : undefined,
      summary: summaries.get(item.id),
    }));
    return { items: withNames, total, page, pageSize };
  }

  /**
   * Résumé lisible des demandes portant sur une intervention (site, créneau, changement demandé),
   * recalculé à la lecture : le résumé saisi à la création n'est pas conservé en base.
   */
  private async describeInterventionRequests(
    items: { id: string; actionType: string; entityType: string; entityId: string | null; payload: unknown; previousState: unknown }[],
  ) {
    const interventionIds = items.filter((i) => i.entityType === 'Intervention' && i.entityId).map((i) => i.entityId as string);
    const payloadOf = (item: { payload: unknown }) => (item.payload ?? {}) as Record<string, any>;
    const createdSiteIds = items.filter((i) => i.actionType === 'CREATE_INTERVENTION').map((i) => payloadOf(i).siteId).filter(Boolean);
    const [interventions, sites] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { id: { in: interventionIds } },
        select: { id: true, date: true, startTime: true, endTime: true, site: { select: { name: true } } },
      }),
      this.prisma.site.findMany({ where: { id: { in: createdSiteIds } }, select: { id: true, name: true } }),
    ]);
    const interventionById = new Map(interventions.map((i) => [i.id, i]));
    const siteName = new Map(sites.map((s) => [s.id, s.name]));
    // Les dates d'intervention sont stockées à minuit UTC : on les lit en UTC pour garder le bon jour.
    const day = (value: Date | string) =>
      new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value,
      );
    const slot = (date: Date | string, start: string, end: string) => `${day(date)} ${start}–${end}`;
    const names = (ids: unknown) =>
      Array.isArray(ids) ? ids.map((id) => this.usersService.findOne(String(id))?.name ?? 'Agent inconnu').join(', ') : '';

    const summaries = new Map<string, string>();
    for (const item of items) {
      const payload = payloadOf(item);
      if (item.actionType === 'CREATE_INTERVENTION' && payload.date) {
        const nature = payload.subType ? ` · ${payload.subType}` : '';
        summaries.set(item.id, `${siteName.get(payload.siteId) ?? 'Site'} · ${slot(payload.date, payload.startTime, payload.endTime)}${nature}`);
        continue;
      }
      const intervention = item.entityId ? interventionById.get(item.entityId) : undefined;
      if (!intervention) continue;
      // Créneau d'avant la demande quand il est connu (une fois approuvée, l'intervention porte déjà le nouveau).
      const before = (item.previousState ?? {}) as Record<string, any>;
      const base = `${intervention.site.name} · ${slot(
        before.date ?? intervention.date,
        before.startTime ?? intervention.startTime,
        before.endTime ?? intervention.endTime,
      )}`;
      let change = '';
      if (item.actionType === 'UPDATE_INTERVENTION_SCHEDULE' && (payload.date || payload.startTime || payload.endTime)) {
        change = ` → ${slot(payload.date ?? intervention.date, payload.startTime ?? intervention.startTime, payload.endTime ?? intervention.endTime)}`;
      } else if ((item.actionType === 'ASSIGN_AGENT' || item.actionType === 'UNASSIGN_AGENT') && payload.agentIds) {
        change = ` → ${names(payload.agentIds) || 'aucun agent'}`;
      } else if (item.actionType === 'CANCEL_INTERVENTION' && payload.observation) {
        change = ` · motif : ${payload.observation}`;
      }
      summaries.set(item.id, base + change);
    }
    return summaries;
  }
}
