import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SupervisionService } from './supervision.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('supervision')
export class SupervisionController {
  constructor(private readonly service: SupervisionService) {}

  /** Synthèse de l'écran « Aujourd'hui » de la tablette, limitée aux sites du superviseur. */
  @Get('today')
  today(@Req() req: any, @Query('date') date?: string) {
    return this.service.today(req.user, date);
  }
}
