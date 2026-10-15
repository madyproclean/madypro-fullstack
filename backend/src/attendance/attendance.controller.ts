import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateManualAttendanceDto } from './dto/create-manual.dto';
import { RegularizeAttendanceDto } from './dto/regularize-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { CancelAttendanceDto } from './dto/cancel-attendance.dto';
import { MarkArrivalDto } from './dto/mark-arrival.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly scope: SupervisorScopeService,
  ) {}

  /** Un agent ne lit que ses pointages ; un superviseur, ceux des interventions de ses sites. */
  private async loadInScope(req: any, id: string) {
    const attendance = await this.service.findOne(id);
    if (req.user?.role === 'AGENT' && attendance.agent.id !== req.user?.sub) {
      throw new ForbiddenException('Ce pointage ne vous appartient pas');
    }
    await this.scope.assertSite(req.user, attendance.site.id);
    return attendance;
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get()
  async list(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('agentId') userId?: string,
    @Query('interventionId') interventionId?: string,
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    return this.service.list({
      startDate,
      endDate,
      userId: req.user?.role === 'AGENT' ? req.user?.sub ?? userId : userId,
      interventionId,
      status: (status as any) ?? 'all',
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
      siteIds: await this.scope.siteIds(req.user),
    });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get('live-map')
  async getLiveMap(@Req() req: any) {
    return this.service.getLiveMap(await this.scope.siteIds(req.user));
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get('anomalies')
  async getAnomalies(@Req() req: any) {
    return this.service.getAnomalies(await this.scope.siteIds(req.user));
  }

  @Get(':id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.loadInScope(req, id);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post('manual')
  async createManual(@Req() req: any, @Body() dto: CreateManualAttendanceDto) {
    if (dto.interventionId) await this.scope.assertIntervention(req.user, dto.interventionId);
    else await this.scope.assertSite(req.user, dto.siteId);
    const userId = req.user?.sub ?? req.user?.id;
    const role = req.user?.role ?? 'SUPERVISOR';
    return this.service.createManual({ ...dto, createdByUserId: userId, createdBy: role });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    await this.loadInScope(req, id);
    const actorId = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.service.update(id, dto, actorId);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/regularize')
  async regularize(@Req() req: any, @Param('id') id: string, @Body() dto: RegularizeAttendanceDto) {
    await this.loadInScope(req, id);
    const actorId = req.user?.sub ?? req.user?.id;
    return this.service.regularize(id, dto, { id: actorId });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelAttendanceDto) {
    await this.loadInScope(req, id);
    return this.service.cancel(id, dto);
  }

  // Le pointage est toujours celui de l'appelant : `dto.userId` est ignoré au profit du JWT,
  // sinon n'importe quel agent authentifié pourrait pointer (ou heartbeat) pour un collègue.
  @Roles('AGENT', 'ADMIN', 'SUPERVISOR')
  @Post('check-in')
  checkIn(@Req() req: any, @Body() dto: CheckInDto) {
    return this.service.checkIn({ ...dto, userId: req.user?.sub });
  }

  @Roles('AGENT', 'ADMIN', 'SUPERVISOR')
  @Post('arrival')
  markArrival(@Req() req: any, @Body() dto: MarkArrivalDto) {
    return this.service.markArrival({ ...dto, userId: req.user?.sub });
  }

  @Roles('AGENT', 'ADMIN', 'SUPERVISOR')
  @Post('check-out')
  checkOut(@Req() req: any, @Body() dto: CheckOutDto) {
    return this.service.checkOut({ ...dto, userId: req.user?.sub });
  }

  @Roles('AGENT', 'ADMIN', 'SUPERVISOR')
  @Post('heartbeat')
  heartbeat(@Req() req: any, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat({ ...dto, userId: req.user?.sub });
  }
}
