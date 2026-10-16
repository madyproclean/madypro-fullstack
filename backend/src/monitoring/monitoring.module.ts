import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({ secret: config.get('auth.jwtSecret') }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
  exports: [MonitoringService],
})
export class MonitoringModule {}
