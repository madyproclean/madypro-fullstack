import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { OnboardingService } from './onboarding.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTemplateItemDto } from './dto/create-template-item.dto';
import { SetOnboardingItemStatusDto } from './dto/set-onboarding-item-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @Get('template')
  findTemplate() {
    return this.onboardingService.findTemplate();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('template')
  createTemplateItem(@Body() dto: CreateTemplateItemDto) {
    return this.onboardingService.createTemplateItem(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('template/:id')
  removeTemplateItem(@Param('id') id: string) {
    return this.onboardingService.removeTemplateItem(id);
  }

  @Get('users/:userId')
  async findForUser(@Param('userId') userId: string, @Req() req: Request) {
    const user = req.user as any;
    if (user?.role === 'AGENT' && user?.sub !== userId) {
      throw new ForbiddenException("Vous ne pouvez consulter que votre propre parcours d'intégration");
    }
    if (user?.sub !== userId) await this.scope.assertAgent(user, userId);
    return this.onboardingService.findForUser(userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('users/:userId/seed')
  async seedForUser(@Param('userId') userId: string, @Req() req: Request) {
    await this.scope.assertAgent(req.user as any, userId);
    return this.onboardingService.seedForUser(userId);
  }

  @Patch('items/:id')
  async setDone(@Param('id') id: string, @Body() dto: SetOnboardingItemStatusDto, @Req() req: Request) {
    const user = req.user as any;
    if (SupervisorScopeService.isSupervisor(user)) {
      await this.scope.assertAgent(user, await this.onboardingService.getItemUserId(id));
    }
    return this.onboardingService.setDone(id, dto.done, { userId: user?.sub, role: user?.role });
  }
}
