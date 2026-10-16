import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SupervisionService } from './supervision.service';
import { SupervisionDirectoryService } from './supervision-directory.service';
import { SupervisionInsightsService } from './supervision-insights.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('supervision')
export class SupervisionController {
  constructor(
    private readonly service: SupervisionService,
    private readonly directory: SupervisionDirectoryService,
    private readonly insights: SupervisionInsightsService,
  ) {}

  /** Bilan de fin de journée : missions, retards, heures, anomalies, absences, reste à valider. */
  @Get('day-summary')
  daySummary(@Req() req: any, @Query('date') date?: string) {
    return this.insights.daySummary(req.user, date);
  }

  /** Tableau de pilotage (par agent et par site) sur `days` jours, comparé à la période précédente. */
  @Get('steering')
  steering(@Req() req: any, @Query('days') days?: string) {
    return this.insights.steering(req.user, days ? Number(days) : 30);
  }

  /** Notes qualité moyennes par site (90 jours) et grille de contrôle. */
  @Get('quality')
  qualityOverview(@Req() req: any) {
    return this.insights.qualityOverview(req.user);
  }

  /** Dernières missions et contrôles qualité d'un site. */
  @Get('sites/:id/history')
  siteHistory(@Req() req: any, @Param('id') id: string) {
    return this.insights.siteHistory(req.user, id);
  }

  @Get('sites/:id/inspections')
  listInspections(@Req() req: any, @Param('id') id: string) {
    return this.insights.listInspections(req.user, id);
  }

  @Post('sites/:id/inspections')
  createInspection(@Req() req: any, @Param('id') id: string, @Body() dto: CreateInspectionDto) {
    return this.insights.createInspection(req.user, id, dto);
  }

  /** Synthèse de l'écran « Aujourd'hui » de la tablette, limitée aux sites du superviseur. */
  @Get('today')
  today(@Req() req: any, @Query('date') date?: string) {
    return this.service.today(req.user, date);
  }

  /** Équipe du superviseur avec le statut du jour de chaque agent. */
  @Get('agents')
  team(@Req() req: any) {
    return this.directory.team(req.user);
  }

  /** Fiche agent : contact, heures, certifications, prochaines missions, absences. */
  @Get('agents/:id')
  agentFile(@Req() req: any, @Param('id') id: string) {
    return this.directory.agentFile(req.user, id);
  }

  /** Fiche site : accès, contact, checklists, incidents, missions du jour, agents habituels. */
  @Get('sites/:id')
  siteFile(@Req() req: any, @Param('id') id: string) {
    return this.directory.siteFile(req.user, id);
  }
}
