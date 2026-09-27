import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  findForUser(userId: string) {
    return this.prisma.availability.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  }

  /** `userIds` restreint au périmètre d'un superviseur. */
  findAll(from?: string, to?: string, userIds: string[] | null = null) {
    return this.prisma.availability.findMany({
      where: {
        ...(userIds ? { userId: { in: userIds } } : {}),
        date: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { date: 'asc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  upsert(userId: string, dto: CreateAvailabilityDto) {
    const date = new Date(dto.date);
    return this.prisma.availability.upsert({
      where: { userId_date: { userId, date } },
      update: { type: dto.type, note: dto.note },
      create: { userId, date, type: dto.type, note: dto.note },
    });
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.availability.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Disponibilité introuvable');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException("Vous ne pouvez pas modifier cette disponibilité");
    }
    await this.prisma.availability.delete({ where: { id } });
    return { deleted: true };
  }
}
