import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { ApprovalsService } from './approvals.service';
import { InterventionsService, TEMPLATE_ONLY_MESSAGE } from '../interventions/interventions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RejectApprovalDto } from './dto/reject-approval.dto';

@Controller('approval-requests')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    @Inject(forwardRef(() => InterventionsService))
    private readonly interventionsService: InterventionsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  list(
    @Query('status') status?: string,
    @Query('requestedById') requestedById?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.approvals.list({
      status,
      requestedById,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 50,
    });
  }

  /** Demandes déposées par l'utilisateur connecté (suivi côté superviseur), plus récentes d'abord. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('mine')
  mine(@Req() req: Request, @Query('status') status?: string, @Query('pageSize') pageSize = '50') {
    const user = req.user as any;
    return this.approvals.list({
      status,
      requestedById: user.sub,
      pageSize: Math.min(parseInt(pageSize, 10) || 50, 200),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    const request = await this.approvals.findPending(id);
    try {
      await this.applyRequest(request, user.sub);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Application impossible';
      await this.approvals.markRejected(id, null, `Rejet automatique : ${message}`);
      throw new BadRequestException(`Impossible d'appliquer la demande : ${message}`);
    }
    return this.approvals.markApproved(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectApprovalDto, @Req() req: Request) {
    const user = req.user as any;
    const request = await this.approvals.findPending(id);
    if (request.actionType === 'VALIDATE_TEMPLATE' && request.entityId) {
      // Proposition refusée : la version en place du gabarit reste active.
      await this.interventionsService.discardPendingTemplate(request.entityId);
    }
    return this.approvals.markRejected(id, user.sub, dto.comment);
  }

  private async applyRequest(
    request: { actionType: string; entityId: string | null; payload: unknown; requestedById: string | null },
    reviewerId: string,
  ) {
    const payload = request.payload as any;
    switch (request.actionType) {
      // Demandes antérieures à la règle « gabarit seul » : ne peuvent plus être appliquées.
      case 'CREATE_INTERVENTION':
      case 'UPDATE_INTERVENTION_SCHEDULE':
      case 'ASSIGN_AGENT':
      case 'UNASSIGN_AGENT':
        throw new BadRequestException(`Demande obsolète, à refuser. ${TEMPLATE_ONLY_MESSAGE}`);
      case 'CANCEL_INTERVENTION':
        if (!request.entityId) throw new Error('Intervention manquante');
        return this.interventionsService.cancel(request.entityId, payload.observation, reviewerId);
      case 'CREATE_TEMPLATE_BATCH':
        return this.interventionsService.createTemplateBatch(payload, reviewerId);
      case 'VALIDATE_TEMPLATE':
        if (!request.entityId) throw new Error('Gabarit manquant');
        return this.interventionsService.validateTemplate(request.entityId, reviewerId, request.requestedById);
      case 'CANCEL_OCCURRENCE':
        return this.interventionsService.createTemplateException(
          payload.templateId,
          { stopId: payload.stopId, date: payload.date, kind: 'CANCEL', reason: payload.reason },
          { id: reviewerId, role: 'ADMIN' },
        );
      default:
        throw new Error('Type d’action non pris en charge');
    }
  }
}
