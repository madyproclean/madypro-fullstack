import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { assertNoPlanningChange, InterventionsService, InterventionFilters } from './interventions.service';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SetSignatureDto } from './dto/set-signature.dto';
import { CreateTemplateExceptionDto } from './dto/create-template-exception.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApprovalsService } from '../approvals/approvals.service';
import { SupervisorScopeGuard } from '../common/supervisor-scope/supervisor-scope.guard';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@Controller('interventions')
export class InterventionsController {
  constructor(
    private readonly service: InterventionsService,
    @Inject(forwardRef(() => ApprovalsService))
    private readonly approvals: ApprovalsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  /** Superviseur : le gabarit doit porter sur l'un de ses sites. */
  private async assertTemplateInScope(req: Request, templateId: string) {
    if (!SupervisorScopeService.isSupervisor(req.user as any)) return;
    const template = await this.service.getTemplate(templateId);
    await this.scope.assertSite(req.user as any, template.siteId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get()
  async list(
    @Req() req: Request,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('siteId') siteId?: string,
    @Query('type') type?: string,
    @Query('subType') subType?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    const user = req.user as any;
    const filters: InterventionFilters = {
      startDate,
      endDate,
      siteId,
      type: (type as any) ?? 'all',
      subType,
      // Un agent ne voit que ses propres interventions, quel que soit le paramètre envoyé.
      agentId: user?.role === 'AGENT' ? user.sub : agentId,
      status: (status as any) ?? 'all',
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
      siteIds: await this.scope.siteIds(user),
    };
    return this.service.list(filters);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('next')
  getNextForUser(@Req() req: Request) {
    const user = req.user as any;
    return this.service.getNextInterventionForUser(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('route-optimization')
  async getRouteOptimization(@Req() req: Request, @Query('userId') userId?: string, @Query('date') date?: string) {
    const user = req.user as any;
    const targetUserId = user.role === 'AGENT' ? user.sub : userId;
    if (!targetUserId || !date) {
      return { userId: targetUserId, date, stops: [], totalDistanceMeters: 0 };
    }
    await this.scope.assertAgent(user, targetUserId);
    return this.service.getRouteOptimization(targetUserId, date);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('estimate-duration')
  async estimateDuration(@Req() req: Request, @Query('siteId') siteId: string, @Query('type') type?: string) {
    await this.scope.assertSite(req.user as any, siteId);
    return this.service.estimateDuration(siteId, type);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('site', 'siteId'))
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('site-roster/:siteId')
  getSiteRoster(@Param('siteId') siteId: string) {
    return this.service.getSiteRoster(siteId);
  }

  /**
   * Planning de l'utilisateur connecté (agent) : passages prévus par les gabarits, y compris ceux
   * dont la mission n'est pas encore créée (elle l'est peu avant le début).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('my-planning')
  async getMyPlanning(@Req() req: Request, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? '')) {
      throw new BadRequestException('Dates attendues au format AAAA-MM-JJ');
    }
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
    if (days < 0 || days > 93) throw new BadRequestException('Période de 3 mois au plus');
    return this.service.getPlanning({ startDate, endDate, agentId: (req.user as any).sub });
  }

  /** Mes heures du mois (prévues, faites), missions faites et à venir, retards. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('me/month-summary')
  myMonthSummary(@Req() req: Request, @Query('month') month?: string) {
    return this.service.myMonthSummary((req.user as any).sub, month);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('planning')
  async getPlanning(
    @Req() req: Request,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('agentId') agentId?: string,
    @Query('siteId') siteId?: string,
  ) {
    const siteIds = await this.scope.siteIds(req.user as any);
    return this.service.getPlanning({ startDate, endDate, agentId, siteId, siteIds });
  }

  /** Validation groupée des missions à valider (superviseur), sur ses seuls sites. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERVISOR')
  @Post('validate-batch')
  async validateBatch(@Body('ids') ids: string[], @Req() req: Request) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('Aucune mission sélectionnée');
    const user = req.user as any;
    const allowed: string[] = [];
    const outOfScope: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.scope.assertIntervention(user, id);
        allowed.push(id);
      } catch {
        outOfScope.push({ id, reason: 'Hors de vos sites' });
      }
    }
    const result = await this.service.validateMany(allowed, { id: user.sub, role: user.role });
    return { ...result, refused: [...result.refused, ...outOfScope] };
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.service.findOne(id, { id: user.sub, role: user.role });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  /** Statut, observation, photos, camions, facturation ; le planning se modifie par le gabarit. */
  async update(@Param('id') id: string, @Body() dto: UpdateInterventionDto, @Req() req: Request) {
    assertNoPlanningChange(dto);
    const user = req.user as any;
    return this.service.update(id, dto, user?.sub, user?.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Req() req: Request) {
    const user = req.user as any;
    return this.service.updateStatus(id, status as any, { id: user.sub, role: user.role });
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body('observation') observation: string, @Req() req: Request) {
    const user = req.user as any;
    if (user.role === 'SUPERVISOR') {
      const original = await this.service.findOne(id, { id: user.sub, role: user.role });
      return this.approvals.createRequest({
        actionType: 'CANCEL_INTERVENTION',
        entityType: 'Intervention',
        entityId: id,
        payload: { observation },
        previousState: { status: original.status },
        requestedById: user.sub,
        summary: observation,
      });
    }
    return this.service.cancel(id, observation, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/list')
  async listTemplates(@Req() req: Request) {
    return this.service.listTemplates(await this.scope.siteIds(req.user as any));
  }

  // Doit être déclarée avant 'templates/:id' (sinon Express matche :id="agent-suggestions").
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/agent-suggestions')
  async getTemplateAgentSuggestions(
    @Req() req: Request,
    @Query('siteId') siteId: string,
    @Query('excludeAgentIds') excludeAgentIds?: string,
  ) {
    await this.scope.assertSite(req.user as any, siteId);
    const exclude = excludeAgentIds ? excludeAgentIds.split(',').filter(Boolean) : [];
    return this.service.getTemplateAgentSuggestions(siteId, exclude);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    return this.service.getTemplate(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto, @Req() req: Request) {
    const user = req.user as any;
    await this.scope.assertSite(user, dto.siteId);
    return this.service.createTemplate(dto, user.sub, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @Req() req: Request) {
    const user = req.user as any;
    await this.assertTemplateInScope(req, id);
    if (dto.siteId !== undefined) await this.scope.assertSite(user, dto.siteId);
    return this.service.updateTemplate(id, dto, user.sub, user.role);
  }

  /** Aperçu d'un nouveau gabarit avant sa création. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates/impact')
  async previewNewTemplateImpact(@Body() dto: UpdateTemplateDto, @Req() req: Request) {
    if (!dto.siteId) throw new BadRequestException('Site manquant');
    await this.scope.assertSite(req.user as any, dto.siteId);
    return this.service.previewTemplateImpact(null, dto);
  }

  /** Aperçu des missions ajoutées, retirées ou modifiées par une modification, avant enregistrement. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates/:id/impact')
  async previewTemplateImpact(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    const impact = await this.service.previewTemplateImpact(id, dto);
    return { ...impact, requiresValidation: (req.user as any).role !== 'ADMIN' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/:id/revisions')
  async listTemplateRevisions(@Param('id') id: string, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    return this.service.listTemplateRevisions(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('templates/:id/revisions/:revisionId/restore')
  restoreTemplateRevision(@Param('id') id: string, @Param('revisionId') revisionId: string, @Req() req: Request) {
    return this.service.restoreTemplateRevision(id, revisionId, (req.user as any).sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/:id/exceptions')
  async listTemplateExceptions(@Param('id') id: string, @Req() req: Request, @Query('from') from?: string) {
    await this.assertTemplateInScope(req, id);
    return this.service.listTemplateExceptions(id, from);
  }

  /** Exception d'un seul jour : remplacer les agents (direct) ou annuler (validation admin pour un superviseur). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates/:id/exceptions')
  async createTemplateException(@Param('id') id: string, @Body() dto: CreateTemplateExceptionDto, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    const user = req.user as any;
    return this.service.createTemplateException(id, dto, { id: user.sub, role: user.role });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete('templates/:id/exceptions/:exceptionId')
  async deleteTemplateException(@Param('id') id: string, @Param('exceptionId') exceptionId: string, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    return this.service.deleteTemplateException(id, exceptionId, (req.user as any).sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/:id/pauses')
  async listTemplatePauses(@Param('id') id: string, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    return this.service.listTemplatePauses(id);
  }

  /** Période sans passage (fermeture) : réservé à l'administrateur. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('templates/:id/pauses')
  addTemplatePause(@Param('id') id: string, @Body() dto: { from: string; to: string; reason?: string }, @Req() req: Request) {
    return this.service.addTemplatePause(id, dto, (req.user as any).sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('templates/:id/pauses/:pauseId')
  deleteTemplatePause(@Param('id') id: string, @Param('pauseId') pauseId: string, @Req() req: Request) {
    return this.service.deleteTemplatePause(id, pauseId, (req.user as any).sub);
  }

  /** Copie les créneaux d'un gabarit vers un autre site (sans agents). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates/:id/duplicate')
  async duplicateTemplate(@Param('id') id: string, @Body('siteId') siteId: string, @Req() req: Request) {
    if (!siteId) throw new BadRequestException('Site cible manquant');
    await this.assertTemplateInScope(req, id);
    const user = req.user as any;
    await this.scope.assertSite(user, siteId);
    return this.service.duplicateTemplate(id, siteId, user.sub, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch('templates/:id/toggle')
  async toggleTemplate(@Param('id') id: string, @Body('active') active: boolean, @Req() req: Request) {
    await this.assertTemplateInScope(req, id);
    return this.service.toggleTemplate(id, active);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/:id/preview')
  async previewTemplate(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: Request,
  ) {
    await this.assertTemplateInScope(req, id);
    return this.service.previewTemplateOccurrences(id, startDate, endDate);
  }

  /**
   * Génération manuelle, en avance, à partir d'un gabarit déjà validé (ex. pour avoir de l'avance
   * avant l'envoi d'un planning client) — les interventions réelles quotidiennes sont sinon
   * créées automatiquement peu avant leur début, sans action requise ici.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates/:id/generate')
  async generateTemplate(
    @Param('id') id: string,
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const template = await this.service.getTemplate(id);
    await this.scope.assertSite(user, template.siteId);
    if (!template.validatedAt) {
      throw new BadRequestException('Le gabarit doit être validé avant de pouvoir être généré.');
    }
    const preview = await this.service.previewTemplateOccurrences(id, startDate, endDate);
    if (!preview.occurrences.length) {
      throw new BadRequestException('Aucune occurrence à générer sur cette période.');
    }
    const payload = {
      templateId: preview.templateId,
      templateLabel: preview.templateLabel,
      occurrences: preview.occurrences.map(({ date, stopId, siteId, categoryId, startTime, endTime, agentIds }) => ({
        date,
        stopId,
        siteId,
        categoryId,
        startTime,
        endTime,
        agentIds,
      })),
    };
    return this.service.createTemplateBatch(payload, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id/checklist')
  listChecklist(@Param('id') id: string) {
    return this.service.listChecklist(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Patch(':id/checklist/:itemId')
  toggleChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body('done') done: boolean,
    @Req() req: Request,
  ) {
    return this.service.toggleChecklistItem(id, itemId, done, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/assignment-suggestions')
  getAssignmentSuggestions(@Param('id') id: string) {
    return this.service.getAssignmentSuggestions(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Post(':id/signature')
  setClientSignature(@Param('id') id: string, @Body() dto: SetSignatureDto, @Req() req: Request) {
    return this.service.setClientSignature(id, dto.signature, (req.user as any)?.sub);
  }
}
