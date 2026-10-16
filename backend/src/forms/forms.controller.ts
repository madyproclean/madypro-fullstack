import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { FormsService } from './forms.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFormDto } from './dto/create-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR', 'AGENT')
@Controller('forms')
export class FormsController {
  constructor(
    private readonly formsService: FormsService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @Get()
  findAll() {
    return this.formsService.findAll();
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  create(@Body() dto: CreateFormDto) {
    return this.formsService.create(dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.formsService.archive(id);
  }

  @Post(':id/submissions')
  submit(@Param('id') id: string, @Body() dto: SubmitFormDto, @Req() req: Request) {
    return this.formsService.submit(id, (req.user as any)?.sub, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Get(':id/submissions')
  async findSubmissions(@Param('id') id: string, @Req() req: Request) {
    return this.formsService.findSubmissions(id, await this.scope.siteIds(req.user as any));
  }
}
