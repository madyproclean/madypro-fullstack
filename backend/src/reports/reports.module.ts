import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ClientReportService } from './client-report.service';
import { PrismaModule } from '../database/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PrismaModule, SettingsModule, NotificationsModule, WebhooksModule, DocumentsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ClientReportService],
  exports: [ClientReportService],
})
export class ReportsModule {}
