import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AnomaliesService } from './anomalies.service';
import { CreateAnomalyDto } from './dto/create-anomaly.dto';
import { UpdateAnomalyStatusDto } from './dto/update-anomaly-status.dto';
import { SupervisorScopeGuard } from '../common/supervisor-scope/supervisor-scope.guard';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('anomalies')
export class AnomaliesController {
  constructor(
    private readonly service: AnomaliesService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @UseGuards(SupervisorScopeGuard('intervention', 'interventionId'))
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':interventionId')
  list(@Param('interventionId') interventionId: string) {
    return this.service.listByIntervention(interventionId);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Post()
  async create(@Req() req: any, @Body() dto: CreateAnomalyDto) {
    await this.scope.assertIntervention(req.user, dto.interventionId);
    const userId = req.user?.sub ?? req.user?.id;
    return this.service.create(dto, userId);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/status')
  async resolve(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAnomalyStatusDto) {
    await this.scope.assertIntervention(req.user, await this.service.getInterventionId(id));
    return this.service.updateStatus(id, dto);
  }
}
