import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SendNotificationDto } from './dto/send-notification.dto';
import { RegisterTokenDto } from './dto/register-token.dto';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { Query } from '@nestjs/common';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  /** Superviseur : ses sites et ses agents, cibles possibles d'un envoi ; `null` pour l'admin. */
  private async scopedTargets(req: any): Promise<string[] | null> {
    const [siteIds, agentIds] = await Promise.all([this.scope.siteIds(req.user), this.scope.agentIds(req.user)]);
    return siteIds && agentIds ? [...siteIds, ...agentIds] : null;
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get()
  async list(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    return this.service.list(parseInt(page, 10) || 1, parseInt(pageSize, 10) || 20, await this.scopedTargets(req));
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('feed')
  async feed(@Req() req: any) {
    return this.service.feed(req.user, await this.scopedTargets(req));
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  async send(@Req() req: any, @Body() dto: SendNotificationDto) {
    if (SupervisorScopeService.isSupervisor(req.user)) {
      // Un superviseur n'écrit qu'aux agents d'un de ses sites ou à un agent de son équipe.
      if (dto.audience === 'SITE_AGENTS') await this.scope.assertSite(req.user, dto.targetId);
      else if (dto.audience === 'AGENT') await this.scope.assertAgent(req.user, dto.targetId);
      else throw new ForbiddenException("L'envoi à tous les agents est réservé à l'administrateur");
    }
    return this.service.send(dto);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Post('register-token')
  registerToken(@Req() req: any, @Body() dto: RegisterTokenDto) {
    const userId = req.user?.sub ?? req.user?.userId;
    return this.service.registerToken(userId, dto.expoToken || dto.token, dto.deviceToken);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.userId;
    return this.service.markRead(id, userId);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/read-stats')
  async getReadStats(@Req() req: any, @Param('id') id: string) {
    const targets = await this.scopedTargets(req);
    if (targets) {
      const targetId = await this.service.getTargetId(id);
      if (!targetId || !targets.includes(targetId)) {
        throw new ForbiddenException("Cette notification n'est pas dans votre périmètre");
      }
    }
    return this.service.getReadStats(id);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get('templates/list')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post('templates')
  createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Roles('ADMIN')
  @Delete('templates/:id')
  removeTemplate(@Param('id') id: string) {
    return this.service.removeTemplate(id);
  }
}
