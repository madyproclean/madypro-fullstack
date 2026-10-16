import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserPermissionsDto } from './dto/update-user-permissions.dto';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { PrismaService } from '../database/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly scope: SupervisorScopeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Un superviseur ne gère que des comptes AGENT : ceux de son périmètre, ou ceux qui n'ont encore
   * jamais été affectés (compte qu'il vient de créer). Jamais un admin ni un autre superviseur.
   */
  private async assertCanManage(req: Request, targetId: string, nextRole?: string) {
    const viewer = req.user as any;
    if (!SupervisorScopeService.isSupervisor(viewer)) return;
    const target = this.usersService.findOne(targetId);
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    if (target.role !== 'AGENT' || (nextRole && nextRole.toUpperCase() !== 'AGENT')) {
      throw new ForbiddenException('Un superviseur ne peut gérer que des comptes agents');
    }
    const agentIds = await this.scope.agentIds(viewer);
    if (agentIds?.has(targetId)) return;
    const everAssigned = await this.prisma.interventionAssignment.count({ where: { userId: targetId } });
    if (everAssigned > 0) {
      throw new ForbiddenException("Cet agent n'est pas dans votre périmètre de supervision");
    }
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Req() req?: Request,
  ) {
    // Superviseur : annuaire des agents uniquement (nécessaire pour affecter une mission),
    // jamais les comptes administrateurs ou superviseurs.
    if (SupervisorScopeService.isSupervisor(req?.user as any)) {
      if (role && role.toUpperCase() !== 'AGENT') {
        return { items: [], total: 0, page: parseInt(page, 10) || 1, pageSize: parseInt(pageSize, 10) || 20 };
      }
      role = 'AGENT';
    }
    return this.usersService.findAll({
      search,
      role,
      status,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = this.usersService.findOne(id);
    const viewer = req.user as any;
    if (
      user &&
      SupervisorScopeService.isSupervisor(viewer) &&
      user.role !== 'AGENT' &&
      user.id !== SupervisorScopeService.viewerId(viewer)
    ) {
      throw new ForbiddenException('Un superviseur ne peut consulter que des comptes agents');
    }
    return user;
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: Request) {
    if (SupervisorScopeService.isSupervisor(req.user as any) && dto.role?.toUpperCase() !== 'AGENT') {
      throw new ForbiddenException('Un superviseur ne peut créer que des comptes agents');
    }
    return this.usersService.create(dto, (req.user as any)?.sub);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    await this.assertCanManage(req, id, dto.role);
    return this.usersService.update(id, dto, (req.user as any)?.sub);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto, @Req() req: Request) {
    await this.assertCanManage(req, id);
    return this.usersService.updateStatus(id, dto, (req.user as any)?.sub);
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.assertCanManage(req, id);
    return this.usersService.resetPassword(id, dto.password, (req.user as any)?.sub);
  }

  @Roles('ADMIN')
  @Patch(':id/permissions')
  updatePermissions(@Param('id') id: string, @Body() dto: UpdateUserPermissionsDto) {
    return this.usersService.setPermissions(id, dto.permissions);
  }
}
