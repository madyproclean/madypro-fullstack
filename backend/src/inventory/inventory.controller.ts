import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { AdjustInventoryItemDto } from './dto/adjust-inventory-item.dto';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'AGENT')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @Get()
  async findAll(@Req() req: any, @Query('siteId') siteId?: string) {
    return this.inventoryService.findAll(siteId, await this.scope.siteIds(req.user));
  }

  @Get('low-stock')
  async findLowStock(@Req() req: any) {
    return this.inventoryService.findLowStock(await this.scope.siteIds(req.user));
  }

  @Get('barcode/:barcode')
  async findByBarcode(@Req() req: any, @Param('barcode') barcode: string) {
    const item = await this.inventoryService.findByBarcode(barcode);
    await this.scope.assertSite(req.user, item.siteId);
    return item;
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  async create(@Req() req: any, @Body() dto: CreateInventoryItemDto) {
    await this.scope.assertSite(req.user, dto.siteId);
    return this.inventoryService.create(dto);
  }

  @Patch(':id/adjust')
  async adjustQuantity(@Req() req: any, @Param('id') id: string, @Body() dto: AdjustInventoryItemDto) {
    await this.scope.assertSite(req.user, await this.inventoryService.getSiteId(id));
    return this.inventoryService.adjustQuantity(id, dto.delta);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    await this.scope.assertSite(req.user, await this.inventoryService.getSiteId(id));
    return this.inventoryService.remove(id);
  }
}
