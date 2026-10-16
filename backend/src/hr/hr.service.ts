import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private userFilter(userId: string | undefined, userIds: string[] | null) {
    if (!userIds) return userId ? { userId } : {};
    if (userId) return { userId: userIds.includes(userId) ? userId : '__none__' };
    return { userId: { in: userIds } };
  }

  async getCertificationUserId(id: string): Promise<string> {
    const existing = await this.prisma.certification.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundException('Certification introuvable');
    return existing.userId;
  }

  async getDocumentUserId(id: string): Promise<string> {
    const existing = await this.prisma.employeeDocument.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundException('Document introuvable');
    return existing.userId;
  }

  /** `userIds` restreint au périmètre d'un superviseur. */
  findCertifications(userId?: string, userIds: string[] | null = null) {
    return this.prisma.certification.findMany({
      where: this.userFilter(userId, userIds),
      orderBy: { expiresAt: 'asc' },
    });
  }

  findExpiringCertifications(days = 30, userIds: string[] | null = null) {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.certification.findMany({
      where: { expiresAt: { gte: now, lte: horizon }, ...this.userFilter(undefined, userIds) },
      orderBy: { expiresAt: 'asc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  createCertification(dto: CreateCertificationDto) {
    return this.prisma.certification.create({
      data: {
        userId: dto.userId,
        label: dto.label,
        obtainedAt: dto.obtainedAt ? new Date(dto.obtainedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async updateCertification(id: string, dto: UpdateCertificationDto) {
    const existing = await this.prisma.certification.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Habilitation introuvable');
    }
    return this.prisma.certification.update({
      where: { id },
      data: {
        label: dto.label,
        obtainedAt: dto.obtainedAt ? new Date(dto.obtainedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async removeCertification(id: string) {
    const existing = await this.prisma.certification.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Habilitation introuvable');
    }
    await this.prisma.certification.delete({ where: { id } });
    return { deleted: true };
  }

  findDocuments(userId?: string, userIds: string[] | null = null) {
    return this.prisma.employeeDocument.findMany({
      where: this.userFilter(userId, userIds),
      orderBy: { createdAt: 'desc' },
    });
  }

  createDocument(dto: CreateEmployeeDocumentDto) {
    return this.prisma.employeeDocument.create({
      data: { userId: dto.userId, type: dto.type, label: dto.label, fileUrl: dto.fileUrl },
    });
  }

  async removeDocument(id: string) {
    const existing = await this.prisma.employeeDocument.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Document introuvable');
    }
    await this.prisma.employeeDocument.delete({ where: { id } });
    return { deleted: true };
  }
}
