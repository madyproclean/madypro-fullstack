import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
import { SupervisionDirectoryService } from './supervision-directory.service';
import { SupervisionInsightsService } from './supervision-insights.service';

@Module({
  imports: [SettingsModule],
  controllers: [SupervisionController],
  providers: [SupervisionService, SupervisionDirectoryService, SupervisionInsightsService],
})
export class SupervisionModule {}
