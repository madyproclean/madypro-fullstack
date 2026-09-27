import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateAbsenceRequestDto } from './dto/create-absence-request.dto';
import { CreateManualAbsenceDto } from './dto/create-manual-absence.dto';
import { UpdateAbsenceStatusDto } from './dto/update-absence-status.dto';
import { BadRequestException } from '@nestjs/common';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('absences')
export class AbsencesController {
  constructor(private readonly service: AbsencesService) {}

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get()
  list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('agentId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('manual') manual?: string,
    @Query('siteId') siteId?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    const viewer = req.user;
    const enforcedUserId = viewer?.role?.toUpperCase() === 'AGENT' ? viewer.userId : userId;
    return this.service.list(
      {
        status: (status as any) ?? 'all',
        type: (type as any) ?? 'all',
        userId: enforcedUserId,
        startDate,
        endDate,
        manual: manual === 'true',
        siteId,
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
      },
      { id: viewer?.userId, role: viewer?.role },
    );
  }

  @Roles('AGENT')
  @Get('me')
  listMine(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    const viewer = req.user;
    return this.service.list(
      {
        status: (status as any) ?? 'all',
        type: (type as any) ?? 'all',
        userId: viewer?.userId,
        startDate,
        endDate,
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
      },
      { id: viewer?.userId, role: 'AGENT' },
    );
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const absence = await this.service.detail(id, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
    if (req.user?.role === 'AGENT' && absence.agent.id !== req.user.userId) {
      throw new ForbiddenException('Accès refusé');
    }
    return absence;
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Post('request')
  async request(@Req() req: any, @Body() body: CreateAbsenceRequestDto) {
    const viewer = req.user;
    const enforcedUserId = viewer?.role?.toUpperCase() === 'AGENT' ? viewer.userId : body.userId;
    if (!enforcedUserId) {
      throw new BadRequestException('userId requis');
    }
    await this.service.assertAgentInScope(enforcedUserId, { id: viewer?.userId ?? viewer?.sub, role: viewer?.role });
    return this.service.request({ ...body, userId: enforcedUserId });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post('manual')
  createManual(@Req() req: any, @Body() body: CreateManualAbsenceDto) {
    return this.service.createManual(body, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/status')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: UpdateAbsenceStatusDto) {
    return this.service.updateStatus(id, body, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/approve-level1')
  approveLevel1(@Param('id') id: string, @Req() req: any) {
    return this.service.approveLevel1(id, req.user?.userId ?? req.user?.sub, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/replacement-suggestions')
  getReplacementSuggestions(@Req() req: any, @Param('id') id: string) {
    return this.service.getReplacementSuggestions(id, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('leave-balance/:userId')
  async getLeaveBalance(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('year') year?: string,
  ) {
    if (req.user?.role === 'AGENT' && req.user.userId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }
    if (req.user?.userId !== userId) {
      await this.service.assertAgentInScope(userId, { id: req.user?.userId ?? req.user?.sub, role: req.user?.role });
    }
    return this.service.getLeaveBalance(userId, year ? Number(year) : new Date().getFullYear());
  }

  @Roles('ADMIN')
  @Patch('leave-balance/:userId')
  setLeaveAllocation(
    @Param('userId') userId: string,
    @Body() body: { year: number; allocatedDays: number },
  ) {
    return this.service.setLeaveAllocation(userId, body.year, body.allocatedDays);
  }

  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get('blocked-periods/list')
  listBlockedPeriods() {
    return this.service.listBlockedPeriods();
  }

  @Roles('ADMIN')
  @Post('blocked-periods')
  createBlockedPeriod(@Body() body: { from: string; to: string; reason: string }) {
    return this.service.createBlockedPeriod(body.from, body.to, body.reason);
  }

  @Roles('ADMIN')
  @Delete('blocked-periods/:id')
  removeBlockedPeriod(@Param('id') id: string) {
    return this.service.removeBlockedPeriod(id);
  }
}
