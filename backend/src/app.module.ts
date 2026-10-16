import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppConfig } from './config/app.config';
import { DbConfig } from './config/db.config';
import { AuthConfig } from './config/auth.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SitesModule } from './sites/sites.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AbsencesModule } from './absences/absences.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { InterventionsModule } from './interventions/interventions.module';
import { PrismaModule } from './database/prisma.module';
import { SupervisorScopeModule } from './common/supervisor-scope/supervisor-scope.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AnomaliesModule } from './anomalies/anomalies.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HrModule } from './hr/hr.module';
import { ShiftSwapsModule } from './shift-swaps/shift-swaps.module';
import { TeamFeedModule } from './team-feed/team-feed.module';
import { BadgesModule } from './badges/badges.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AvailabilityModule } from './availability/availability.module';
import { ChatModule } from './chat/chat.module';
import { InventoryModule } from './inventory/inventory.module';
import { PlatformModule } from './platform/platform.module';
import { PublicApiModule } from './public-api/public-api.module';
import { QuotesModule } from './quotes/quotes.module';
import { InvoicesModule } from './invoices/invoices.module';
import { FormsModule } from './forms/forms.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { CategoriesModule } from './categories/categories.module';
import { InboxModule } from './inbox/inbox.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SupervisionModule } from './supervision/supervision.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [AppConfig, DbConfig, AuthConfig],
    }),
    PrismaModule,
    SupervisorScopeModule,
    AuthModule,
    UsersModule,
    SitesModule,
    AssignmentsModule,
    AttendanceModule,
    AbsencesModule,
    ReportsModule,
    SettingsModule,
    NotificationsModule,
    AuditModule,
    InterventionsModule,
    ApprovalsModule,
    RealtimeModule,
    AnomaliesModule,
    WebhooksModule,
    HrModule,
    ShiftSwapsModule,
    TeamFeedModule,
    BadgesModule,
    OnboardingModule,
    AvailabilityModule,
    ChatModule,
    InventoryModule,
    PlatformModule,
    PublicApiModule,
    QuotesModule,
    InvoicesModule,
    FormsModule,
    CategoriesModule,
    SupervisionModule,
    InboxModule,
    MonitoringModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
