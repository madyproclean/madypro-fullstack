import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InboxService } from './inbox.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  /** Tout ce qui attend l'administrateur, trié par urgence. */
  @Get()
  list() {
    return this.inbox.list();
  }
}
