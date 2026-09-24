import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards, Query } from '@nestjs/common';
import { Request } from 'express';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { CreateSiteCategoryDto } from './dto/create-site-category.dto';
import { UpdateSiteCategoryDto } from './dto/update-site-category.dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly service: SitesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get()
  findAll(
    @Query('active') active?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    return this.service.findAll({
      active: active === undefined ? undefined : active === 'true',
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  create(@Body() dto: CreateSiteDto, @Req() req: Request) {
    return this.service.create(dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto, @Req() req: Request) {
    return this.service.update(id, dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.service.remove(id, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id/categories')
  listSiteCategories(@Param('id') id: string) {
    return this.service.listSiteCategories(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/categories')
  addSiteCategory(@Param('id') id: string, @Body() dto: CreateSiteCategoryDto, @Req() req: Request) {
    return this.service.addSiteCategory(id, dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/categories/:siteCategoryId')
  updateSiteCategory(
    @Param('id') id: string,
    @Param('siteCategoryId') siteCategoryId: string,
    @Body() dto: UpdateSiteCategoryDto,
    @Req() req: Request,
  ) {
    return this.service.updateSiteCategory(id, siteCategoryId, dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id/categories/:siteCategoryId')
  removeSiteCategory(@Param('id') id: string, @Param('siteCategoryId') siteCategoryId: string, @Req() req: Request) {
    return this.service.removeSiteCategory(id, siteCategoryId, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/categories/:siteCategoryId/checklist')
  createSiteCategoryChecklistItem(
    @Param('id') id: string,
    @Param('siteCategoryId') siteCategoryId: string,
    @Body() dto: CreateChecklistItemDto,
    @Req() req: Request,
  ) {
    return this.service.createSiteCategoryChecklistItem(id, siteCategoryId, dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/categories/:siteCategoryId/checklist/:itemId')
  updateSiteCategoryChecklistItem(
    @Param('id') id: string,
    @Param('siteCategoryId') siteCategoryId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: Request,
  ) {
    return this.service.updateSiteCategoryChecklistItem(id, siteCategoryId, itemId, dto, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id/categories/:siteCategoryId/checklist/:itemId')
  removeSiteCategoryChecklistItem(
    @Param('id') id: string,
    @Param('siteCategoryId') siteCategoryId: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
  ) {
    return this.service.removeSiteCategoryChecklistItem(id, siteCategoryId, itemId, (req.user as any)?.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('contracts/expiring')
  findExpiringContracts(@Query('days') days?: string) {
    return this.service.findExpiringContracts(days ? Number(days) : 30);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/contracts')
  listContracts(@Param('id') id: string) {
    return this.service.listContracts(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/contracts')
  createContract(
    @Param('id') id: string,
    @Body() dto: { label: string; startDate: string; endDate: string; slaDetails?: string; documentUrl?: string },
  ) {
    return this.service.createContract(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id/contracts/:contractId')
  removeContract(@Param('id') id: string, @Param('contractId') contractId: string) {
    return this.service.removeContract(id, contractId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Get(':id/zones')
  listZones(@Param('id') id: string) {
    return this.service.listZones(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post(':id/zones')
  createZone(@Param('id') id: string, @Body() dto: { label: string; floor?: string; order?: number }) {
    return this.service.createZone(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  @Patch(':id/zones/:zoneId')
  updateZone(
    @Param('id') id: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: { label?: string; floor?: string; order?: number; completed?: boolean },
  ) {
    return this.service.updateZone(id, zoneId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id/zones/:zoneId')
  removeZone(@Param('id') id: string, @Param('zoneId') zoneId: string) {
    return this.service.removeZone(id, zoneId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/plan')
  setPlanImage(@Param('id') id: string, @Body() dto: { planImageUrl: string | null }) {
    return this.service.setPlanImage(id, dto.planImageUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/incidents')
  getIncidentTimeline(@Param('id') id: string) {
    return this.service.getIncidentTimeline(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/quality-score')
  getQualityScore(@Param('id') id: string) {
    return this.service.getQualityScore(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/qr-code')
  getQrCode(@Param('id') id: string) {
    return this.service.getQrCode(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':id/send-planning')
  sendPlanning(@Param('id') id: string, @Body('periodWeeks') periodWeeks: number, @Req() req: Request) {
    return this.service.sendPlanning(id, periodWeeks && periodWeeks > 0 ? periodWeeks : 4, (req.user as any)?.sub);
  }
}
