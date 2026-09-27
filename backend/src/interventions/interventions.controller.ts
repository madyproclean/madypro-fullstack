import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards, forwardRef } from '@nestjs/common';
import { Request } from 'express';
import { InterventionsService, InterventionFilters } from './interventions.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { DuplicateInterventionDto } from './dto/duplicate-intervention.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SetSignatureDto } from './dto/set-signature.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApprovalsService, ApprovalActionType } from '../approvals/approvals.service';
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

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.service.findOne(id, { id: user.sub, role: user.role });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  async create(@Body() dto: CreateInterventionDto, @Req() req: Request) {
    const user = req.user as any;
    if (user.role === 'SUPERVISOR') {
      await this.scope.assertSite(user, dto.siteId);
      return this.approvals.createRequest({
        actionType: 'CREATE_INTERVENTION',
        entityType: 'Intervention',
        entityId: null,
        payload: dto as unknown as Record<string, unknown>,
        requestedById: user.sub,
        summary: `${dto.date} ${dto.startTime}–${dto.endTime}`,
      });
    }
    return this.service.create(dto, user.sub);
  }

  /**
   * Création ponctuelle multi-arrêts (un ou plusieurs sites, une seule fois) — utilisée par le
   * formulaire unique de création quand plusieurs arrêts sont ajoutés en une soumission.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('batch')
  async createOneshotBatch(@Body('occurrences') occurrences: any[], @Req() req: Request) {
    if (!Array.isArray(occurrences) || !occurrences.length) {
      throw new BadRequestException('Au moins un arrêt est requis.');
    }
    const user = req.user as any;
    if (user.role === 'SUPERVISOR') {
      await this.scope.assertSites(user, occurrences.map((occ) => occ?.siteId));
      return this.approvals.createRequest({
        actionType: 'CREATE_INTERVENTION',
        entityType: 'Intervention',
        entityId: null,
        payload: { occurrences },
        requestedById: user.sub,
        summary: `${occurrences.length} intervention(s)`,
      });
    }
    return this.service.createOneshotBatch(occurrences, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, SupervisorScopeGuard('intervention'))
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInterventionDto, @Req() req: Request) {
    const user = req.user as any;
    const touchesSchedule = dto.date !== undefined || dto.startTime !== undefined || dto.endTime !== undefined;
    const touchesAgents = dto.agentIds !== undefined;
    // Déplacer une intervention vers un site hors périmètre est refusé (le site actuel est vérifié par la garde).
    if (dto.siteId !== undefined) await this.scope.assertSite(user, dto.siteId);

    if (user.role === 'SUPERVISOR' && !dto.status && (touchesSchedule || touchesAgents)) {
      const original = await this.service.findOne(id, { id: user.sub, role: user.role });
      let actionType: ApprovalActionType = 'UPDATE_INTERVENTION_SCHEDULE';
      if (touchesAgents && !touchesSchedule) {
        const before = new Set(original.agentIds);
        const after = new Set(dto.agentIds ?? []);
        const added = [...after].filter((x) => !before.has(x)).length;
        const removed = [...before].filter((x) => !after.has(x)).length;
        actionType = added >= removed ? 'ASSIGN_AGENT' : 'UNASSIGN_AGENT';
      }
      const summary = touchesSchedule
        ? `${dto.date ?? original.date} ${dto.startTime ?? original.startTime}–${dto.endTime ?? original.endTime}`
        : `${(dto.agentIds ?? []).length} agent(s) assigné(s)`;
      return this.approvals.createRequest({
        actionType,
        entityType: 'Intervention',
        entityId: id,
        payload: dto as unknown as Record<string, unknown>,
        previousState: {
          date: original.date,
          startTime: original.startTime,
          endTime: original.endTime,
          agentIds: original.agentIds,
        },
        requestedById: user.sub,
        summary,
      });
    }

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
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Body() dto: DuplicateInterventionDto, @Req() req: Request) {
    return this.service.duplicate(id, dto, (req.user as any)?.sub);
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
