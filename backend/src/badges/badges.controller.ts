import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BadgesService } from './badges.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { AwardBadgeDto } from './dto/award-badge.dto';

@UseGuards(JwtAuthGuard)
@Controller('badges')
export class BadgesController {
  constructor(
    private readonly badgesService: BadgesService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @Get()
  findBadges() {
    return this.badgesService.findBadges();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  createBadge(@Body() dto: CreateBadgeDto) {
    return this.badgesService.createBadge(dto);
  }

  @Get('awards')
  async findAwards(@Req() req: Request, @Query('userId') userId?: string) {
    const agentIds = await this.scope.agentIds(req.user as any);
    return this.badgesService.findAwards(userId, agentIds ? [...agentIds] : null);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('awards')
  async award(@Body() dto: AwardBadgeDto, @Req() req: Request) {
    await this.scope.assertAgent(req.user as any, dto.userId);
    return this.badgesService.award((req.user as any)?.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Delete('awards/:id')
  async revoke(@Param('id') id: string, @Req() req: Request) {
    await this.scope.assertAgent(req.user as any, await this.badgesService.getAwardUserId(id));
    return this.badgesService.revoke(id);
  }
}
