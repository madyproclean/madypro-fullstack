import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';

@Module({
  imports: [SettingsModule],
  controllers: [SupervisionController],
  providers: [SupervisionService],
})
export class SupervisionModule {}
