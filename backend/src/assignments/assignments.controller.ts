import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

// Ancien module (données en mémoire), utilisé ni par le web ni par le mobile : réservé à l'admin.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('siteId') siteId?: string,
    @Query('dayOfWeek') day?: string,
  ) {
    const filters: { userId?: string; siteId?: string; dayOfWeek?: number } = {};
    if (userId) filters.userId = userId;
    if (siteId) filters.siteId = siteId;
    if (day !== undefined) {
      const parsed = Number(day);
      if (!Number.isNaN(parsed)) {
        filters.dayOfWeek = parsed;
      }
    }
    return this.service.findAll(filters);
  }

  @Post()
  create(@Body() dto: CreateAssignmentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
