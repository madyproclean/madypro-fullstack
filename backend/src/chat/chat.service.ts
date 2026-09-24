import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Périmètre d'un superviseur : les agents déjà affectés à au moins une
   * intervention sur l'un de ses sites (aucune fenêtre de dates — un superviseur
   * ne doit jamais perdre l'accès à une conversation existante). `null` = pas de
   * restriction (admin).
   */
  private async getScopedAgentIds(viewerId: string, viewerRole: string): Promise<Set<string> | null> {
    if (viewerRole?.toUpperCase() !== 'SUPERVISOR') return null;
    const siteLinks = await this.prisma.siteSupervisor.findMany({
      where: { userId: viewerId },
      select: { siteId: true },
    });
    const siteIds = siteLinks.map((link) => link.siteId);
    if (!siteIds.length) return new Set();
    const assignments = await this.prisma.interventionAssignment.findMany({
      where: { intervention: { siteId: { in: siteIds } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return new Set(assignments.map((a) => a.userId));
  }

  async assertThreadAccessible(threadUserId: string, viewerId: string, viewerRole: string) {
    const scopedAgentIds = await this.getScopedAgentIds(viewerId, viewerRole);
    if (scopedAgentIds && !scopedAgentIds.has(threadUserId)) {
      throw new ForbiddenException("Cet agent n'est pas dans votre périmètre de supervision");
    }
  }

  async listThreads(viewerId: string, viewerRole: string) {
    const scopedAgentIds = await this.getScopedAgentIds(viewerId, viewerRole);
    const agents = this.usersService
      .findAll({ role: 'AGENT', pageSize: 500 })
      .items.filter((agent) => !scopedAgentIds || scopedAgentIds.has(agent.id));
    const threads = await Promise.all(
      agents.map(async (agent) => {
        const [lastMessage, unreadCount] = await Promise.all([
          this.prisma.chatMessage.findFirst({
            where: { threadUserId: agent.id },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.chatMessage.count({
            where: { threadUserId: agent.id, senderId: agent.id, readAt: null },
          }),
        ]);
        return { agent: { id: agent.id, name: agent.name }, lastMessage, unreadCount };
      }),
    );
    return threads
      .filter((t) => t.lastMessage)
      .sort((a, b) => (b.lastMessage!.createdAt.getTime() - a.lastMessage!.createdAt.getTime()));
  }

  getThread(threadUserId: string) {
    return this.prisma.chatMessage.findMany({
      where: { threadUserId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(threadUserId: string, senderId: string, senderRole: string, body: string) {
    const message = await this.prisma.chatMessage.create({
      data: { threadUserId, senderId, body },
    });
    const isFromAgent = senderRole === 'AGENT';
    if (!isFromAgent) {
      await this.notifications.send({
        title: 'Nouveau message',
        message: body.length > 120 ? `${body.slice(0, 117)}...` : body,
        audience: 'AGENT',
        targetId: threadUserId,
        category: 'chat',
        data: { path: 'AgentChat' },
      });
    }
    // Diffusé aux clients web (admin/superviseur) connectés au flux temps réel, pour que
    // la messagerie affiche les nouveaux messages sans rechargement manuel de la page —
    // il n'existe pas d'audience de notification push pour les comptes staff (seuls les
    // agents ont un token push mobile), le flux SSE est donc le seul canal de mise à jour live.
    this.realtime.broadcast('chat.message', { threadUserId, senderId, id: message.id });
    return message;
  }

  async markRead(threadUserId: string, readerId: string) {
    await this.prisma.chatMessage.updateMany({
      where: { threadUserId, senderId: { not: readerId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
