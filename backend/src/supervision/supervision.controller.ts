import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SupervisionService } from './supervision.service';
import { SupervisionDirectoryService } from './supervision-directory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('supervision')
export class SupervisionController {
  constructor(
    private readonly service: SupervisionService,
    private readonly directory: SupervisionDirectoryService,
  ) {}

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
