import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTemplateItemDto } from './dto/create-template-item.dto';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findTemplate() {
    return this.prisma.onboardingTemplateItem.findMany({ orderBy: { order: 'asc' } });
  }

  createTemplateItem(dto: CreateTemplateItemDto) {
    return this.prisma.onboardingTemplateItem.create({
      data: { label: dto.label, order: dto.order ?? 0 },
    });
  }

  async removeTemplateItem(id: string) {
    const existing = await this.prisma.onboardingTemplateItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Étape introuvable');
    }
    await this.prisma.onboardingTemplateItem.delete({ where: { id } });
    return { deleted: true };
  }

  findForUser(userId: string) {
    return this.prisma.userOnboardingItem.findMany({ where: { userId }, orderBy: { order: 'asc' } });
  }

  async seedForUser(userId: string) {
    const template = await this.prisma.onboardingTemplateItem.findMany({ orderBy: { order: 'asc' } });
    if (template.length === 0) {
      return [];
    }
    await this.prisma.userOnboardingItem.createMany({
      data: template.map((item) => ({ userId, label: item.label, order: item.order })),
    });
    await this.notifications.send({
      title: "Parcours d'intégration disponible",
      message: `Votre parcours d'intégration est prêt (${template.length} étape(s)).`,
      audience: 'AGENT',
      targetId: userId,
      data: { path: 'AgentOnboardingChecklist' },
    });
    return this.findForUser(userId);
  }

  async getItemUserId(id: string): Promise<string> {
    const item = await this.prisma.userOnboardingItem.findUnique({ where: { id }, select: { userId: true } });
    if (!item) {
      throw new NotFoundException('Étape introuvable');
    }
    return item.userId;
  }

  async setDone(id: string, done: boolean, actor: { userId?: string; role?: string }) {
    const existing = await this.prisma.userOnboardingItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Étape introuvable');
    }
    const isPrivileged = actor.role === 'ADMIN' || actor.role === 'SUPERVISOR';
    if (!isPrivileged && existing.userId !== actor.userId) {
      throw new ForbiddenException("Vous ne pouvez cocher que votre propre parcours d'intégration");
    }
    return this.prisma.userOnboardingItem.update({
      where: { id },
      data: { done, completedAt: done ? new Date() : null },
    });
  }
}
