import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { HrService } from './hr.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller()
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly scope: SupervisorScopeService,
  ) {}

  /** Superviseur : liste des agents de son périmètre ; `null` pour l'admin. */
  private async scopedUserIds(req: any): Promise<string[] | null> {
    const agentIds = await this.scope.agentIds(req.user);
    return agentIds ? [...agentIds] : null;
  }

  @Get('certifications')
  async findCertifications(@Req() req: any, @Query('userId') userId?: string) {
    return this.hrService.findCertifications(userId, await this.scopedUserIds(req));
  }

  @Get('certifications/expiring')
  async findExpiringCertifications(@Req() req: any, @Query('days') days?: string) {
    return this.hrService.findExpiringCertifications(days ? Number(days) : 30, await this.scopedUserIds(req));
  }

  @Post('certifications')
  async createCertification(@Req() req: any, @Body() dto: CreateCertificationDto) {
    await this.scope.assertAgent(req.user, dto.userId);
    return this.hrService.createCertification(dto);
  }

  @Patch('certifications/:id')
  async updateCertification(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCertificationDto) {
    await this.scope.assertAgent(req.user, await this.hrService.getCertificationUserId(id));
    return this.hrService.updateCertification(id, dto);
  }

  @Delete('certifications/:id')
  async removeCertification(@Req() req: any, @Param('id') id: string) {
    await this.scope.assertAgent(req.user, await this.hrService.getCertificationUserId(id));
    return this.hrService.removeCertification(id);
  }

  @Get('employee-documents')
  async findDocuments(@Req() req: any, @Query('userId') userId?: string) {
    return this.hrService.findDocuments(userId, await this.scopedUserIds(req));
  }

  @Post('employee-documents')
  async createDocument(@Req() req: any, @Body() dto: CreateEmployeeDocumentDto) {
    await this.scope.assertAgent(req.user, dto.userId);
    return this.hrService.createDocument(dto);
  }

  @Delete('employee-documents/:id')
  async removeDocument(@Req() req: any, @Param('id') id: string) {
    await this.scope.assertAgent(req.user, await this.hrService.getDocumentUserId(id));
    return this.hrService.removeDocument(id);
  }
}
