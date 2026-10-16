import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MonitoringService } from './monitoring.service';

class ClientErrorDto {
  @IsIn(['WEB', 'MOBILE'])
  source!: 'WEB' | 'MOBILE';

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}

@Controller('monitoring')
export class MonitoringController {
  private readonly hits = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly jwt: JwtService,
  ) {}

  /** Erreur remontée par le site web ou l'application (sans connexion obligatoire, limitée par adresse). */
  @Post('errors')
  report(@Body() dto: ClientErrorDto, @Req() req: any) {
    const ip = String(req.headers?.['x-forwarded-for'] ?? req.ip ?? 'inconnu').split(',')[0];
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (entry && now - entry.since < 60_000) {
      if (++entry.count > 30) throw new HttpException('Trop de signalements', HttpStatus.TOO_MANY_REQUESTS);
    } else {
      this.hits.set(ip, { count: 1, since: now });
    }
    let userId: string | null = null;
    const auth = String(req.headers?.authorization ?? '');
    if (auth.startsWith('Bearer ')) {
      try {
        userId = (this.jwt.verify(auth.slice(7)) as { sub?: string }).sub ?? null;
      } catch {
        userId = null;
      }
    }
    return this.monitoring.record({ ...dto, userId }).then((r) => ({ received: true, isNew: r.isNew }));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('errors')
  list(@Query('all') all?: string) {
    return this.monitoring.list(all === 'true');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('errors/:id/resolve')
  resolve(@Param('id') id: string) {
    return this.monitoring.resolve(id);
  }
}
