import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuditService, AuditFilters } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Roles('ADMIN')
  @Get('export.csv')
  async exportCsv(
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv({
      actorId: actorId || undefined,
      action: (action as any) || undefined,
      startDate,
      endDate,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
    res.send(csv);
  }

  @Get()
  list(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    const filters: AuditFilters = {
      actorId: actorId || undefined,
      action: (action as any) || undefined,
      startDate,
      endDate,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
    };
    return this.service.list(filters);
  }
}
