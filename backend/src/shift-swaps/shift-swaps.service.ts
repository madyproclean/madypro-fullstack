import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateShiftSwapDto } from './dto/create-shift-swap.dto';
import { checkAssignmentConflicts } from '../common/utils/assignment-conflicts.util';

@Injectable()
export class ShiftSwapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  listColleagues(userId: string, search?: string) {
    // Sans terme de recherche, on ne renvoie qu'un aperçu court : avec des centaines d'agents,
    // renvoyer la liste complète serait à la fois inutilisable côté mobile et coûteux côté serveur.
    // +1 pour compenser le cas où l'appelant lui-même fait partie de la page récupérée,
    // sinon la liste promise jusqu'à 20 résultats peut silencieusement tomber à 19.
    const { items } = this.usersService.findAll({
      role: 'AGENT',
      status: 'active',
      search: search?.trim() || undefined,
      pageSize: 21,
    });
    return items
      .filter((u) => u.id !== userId)
      .slice(0, 20)
      .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }));
  }

  /** `siteIds` restreint aux échanges portant sur les interventions de ces sites (superviseur). */
  findAll(userId?: string, siteIds: string[] | null = null) {
    return this.prisma.shiftSwapRequest.findMany({
      where: siteIds
        ? { intervention: { siteId: { in: siteIds } }, ...(userId ? { OR: [{ requesterId: userId }, { targetUserId: userId }] } : {}) }
        : userId
        ? {
            OR: [
              { requesterId: userId },
              { targetUserId: userId },
              // demandes ouvertes (sans destinataire précis) : visibles par tout agent, pour qu'il
              // puisse potentiellement les accepter — sinon accept() n'est jamais atteignable.
              { targetUserId: null, status: 'PENDING' },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        intervention: { select: { id: true, date: true, startTime: true, endTime: true, siteId: true } },
        requester: { select: { id: true, firstName: true, lastName: true } },
        target: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(requesterId: string, dto: CreateShiftSwapDto) {
    if (dto.targetUserId && dto.targetUserId === requesterId) {
      throw new BadRequestException('Vous ne pouvez pas vous proposer un échange à vous-même');
    }
    const assignment = await this.prisma.interventionAssignment.findUnique({
      where: { interventionId_userId: { interventionId: dto.interventionId, userId: requesterId } },
    });
    if (!assignment) {
      throw new BadRequestException("Vous n'êtes pas affecté à cette intervention");
    }
    const intervention = await this.prisma.intervention.findUnique({ where: { id: dto.interventionId } });
    if (!intervention || intervention.status !== 'PLANNED') {
      throw new BadRequestException(
        "Cette mission n'est plus proposable à l'échange (déjà démarrée, terminée ou annulée)",
      );
    }
    const request = await this.prisma.shiftSwapRequest.create({
      data: {
        interventionId: dto.interventionId,
        requesterId,
        targetUserId: dto.targetUserId,
        reason: dto.reason,
      },
    });
    if (dto.targetUserId) {
      await this.notifications.send({
        title: 'Échange de shift proposé',
        message: 'Un collègue vous propose un échange de mission.',
        audience: 'AGENT',
        targetId: dto.targetUserId,
        data: { path: 'AgentShiftSwaps' },
      });
    }
    return request;
  }

  private async ensureRequest(id: string) {
    const request = await this.prisma.shiftSwapRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Demande introuvable');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }
    return request;
  }

  async accept(id: string, userId: string) {
    const request = await this.ensureRequest(id);
    if (request.targetUserId && request.targetUserId !== userId) {
      throw new ForbiddenException("Cette demande ne vous est pas destinée");
    }
    if (request.requesterId === userId) {
      throw new BadRequestException('Vous ne pouvez pas accepter votre propre demande');
    }

    const intervention = await this.prisma.intervention.findUnique({ where: { id: request.interventionId } });
    if (!intervention) {
      throw new NotFoundException('Intervention introuvable');
    }
    // La mission a pu démarrer, être terminée ou annulée entre la création de la demande et son
    // acceptation : on ne réaffecte jamais une mission qui n'est plus au statut PLANNED.
    if (intervention.status !== 'PLANNED') {
      throw new BadRequestException(
        "Cette mission n'est plus disponible pour un échange (déjà démarrée, terminée ou annulée)",
      );
    }

    const dateStr = intervention.date.toISOString().slice(0, 10);
    // Même contrôle que l'affectation classique (chevauchement + absence approuvée), pour ne pas
    // laisser l'échange de shift réaffecter un agent en congé ou déjà planifié ailleurs.
    await checkAssignmentConflicts(this.prisma, [userId], dateStr, intervention.startTime, intervention.endTime, intervention.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Verrou optimiste : ne bascule ACCEPTED que si la demande est encore PENDING, pour empêcher
      // deux agents d'accepter la même demande ouverte en même temps (double affectation).
      const claim = await tx.shiftSwapRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'ACCEPTED', targetUserId: userId, respondedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Cette demande a déjà été traitée');
      }

      await tx.interventionAssignment.deleteMany({
        where: { interventionId: request.interventionId, userId: request.requesterId },
      });
      // Le demandeur n'est plus responsable de cette mission : son éventuel pointage (arrivée...)
      // devient obsolète et ne doit pas rester orphelin en base.
      await tx.attendance.deleteMany({
        where: { interventionId: request.interventionId, userId: request.requesterId },
      });
      await tx.interventionAssignment.upsert({
        where: { interventionId_userId: { interventionId: request.interventionId, userId } },
        update: {},
        create: { interventionId: request.interventionId, userId },
      });
      // Le gabarit reste la référence : l'échange est noté comme exception du jour sur son créneau.
      if (intervention.generatedFromTemplateId && intervention.generatedFromStopId) {
        const agentIds = (await tx.interventionAssignment.findMany({
          where: { interventionId: request.interventionId },
          select: { userId: true },
        })).map((a) => a.userId);
        await tx.templateException.upsert({
          where: { stopId_date: { stopId: intervention.generatedFromStopId, date: intervention.date } },
          create: {
            templateId: intervention.generatedFromTemplateId,
            stopId: intervention.generatedFromStopId,
            date: intervention.date,
            kind: 'REPLACE_AGENTS',
            agentIds,
            reason: 'Échange entre agents',
            createdById: userId,
          },
          update: { kind: 'REPLACE_AGENTS', agentIds, reason: 'Échange entre agents', createdById: userId },
        });
      }

      return tx.shiftSwapRequest.findUniqueOrThrow({ where: { id } });
    });

    await this.notifications.send({
      title: 'Échange de shift accepté',
      message: 'Votre demande d’échange de mission a été acceptée.',
      audience: 'AGENT',
      targetId: request.requesterId,
      data: { path: 'AgentShiftSwaps' },
    });

    return updated;
  }

  async reject(id: string, userId: string) {
    const request = await this.ensureRequest(id);
    // Une demande ouverte (sans destinataire précis) n'est adressée à personne en particulier :
    // seul le demandeur peut la retirer (via cancel()), un agent tiers ne peut pas la rejeter.
    if (!request.targetUserId || request.targetUserId !== userId) {
      throw new ForbiddenException("Cette demande ne vous est pas destinée");
    }
    const claim = await this.prisma.shiftSwapRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }
    await this.notifications.send({
      title: 'Échange de shift refusé',
      message: 'Votre demande d’échange de mission a été refusée.',
      audience: 'AGENT',
      targetId: request.requesterId,
      data: { path: 'AgentShiftSwaps' },
    });
    return this.prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id } });
  }

  async cancel(id: string, userId: string) {
    const request = await this.ensureRequest(id);
    if (request.requesterId !== userId) {
      throw new ForbiddenException('Seul le demandeur peut annuler cette demande');
    }
    return this.prisma.shiftSwapRequest.update({
      where: { id },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }
}
