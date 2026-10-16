import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ShiftSwapsService } from './shift-swaps.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateShiftSwapDto } from './dto/create-shift-swap.dto';

@UseGuards(JwtAuthGuard)
@Controller('shift-swaps')
export class ShiftSwapsController {
  constructor(
    private readonly shiftSwapsService: ShiftSwapsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @Get()
  async findAll(@Query('userId') userId: string | undefined, @Req() req: Request) {
    const user = req.user as any;
    // Un agent ne peut voir que ses propres demandes (le paramètre userId est ignoré pour lui) ;
    // admin/superviseur gardent la vue globale nécessaire à l'arbitrage (userId optionnel).
    const effectiveUserId = user?.role === 'AGENT' ? user?.sub : userId;
    return this.shiftSwapsService.findAll(effectiveUserId, await this.scope.siteIds(user));
  }

  @Get('colleagues')
  listColleagues(@Query('search') search: string | undefined, @Req() req: Request) {
    return this.shiftSwapsService.listColleagues((req.user as any)?.sub, search);
  }

  @Post()
  create(@Body() dto: CreateShiftSwapDto, @Req() req: Request) {
    return this.shiftSwapsService.create((req.user as any)?.sub, dto);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Req() req: Request) {
    return this.shiftSwapsService.accept(id, (req.user as any)?.sub);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: Request) {
    return this.shiftSwapsService.reject(id, (req.user as any)?.sub);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: Request) {
    return this.shiftSwapsService.cancel(id, (req.user as any)?.sub);
  }
}
