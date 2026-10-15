import { Module } from '@nestjs/common';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { UsersModule } from '../users/users.module';
import { SitesModule } from '../sites/sites.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InterventionsModule } from '../interventions/interventions.module';

@Module({
  imports: [UsersModule, SitesModule, AuditModule, NotificationsModule, InterventionsModule],
  controllers: [AbsencesController],
  providers: [AbsencesService],
})
export class AbsencesModule {}
