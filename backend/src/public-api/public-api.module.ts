import { ReportsModule } from '../reports/reports.module';
import { InterventionsModule } from '../interventions/interventions.module';
import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { PlatformModule } from '../platform/platform.module';
import { SitesModule } from '../sites/sites.module';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Module({
  imports: [PlatformModule, SitesModule, ReportsModule, InterventionsModule],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiKeyGuard],
})
export class PublicApiModule {}
