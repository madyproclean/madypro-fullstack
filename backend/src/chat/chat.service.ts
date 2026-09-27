import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
    private readonly realtime: RealtimeService,
    private readonly scope: SupervisorScopeService,
  ) {}

  async assertThreadAccessible(threadUserId: string, viewerId: string, viewerRole: string) {
    const scopedAgentIds = await this.scope.agentIds({ id: viewerId, role: viewerRole });
    if (scopedAgentIds && !scopedAgentIds.has(threadUserId)) {
      throw new ForbiddenException("Cet agent n'est pas dans votre périmètre de supervision");
    }
  }

  async listThreads(viewerId: string, viewerRole: string) {
    const scopedAgentIds = await this.scope.agentIds({ id: viewerId, role: viewerRole });
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
    if (isFromAgent) {
      const agentName = this.usersService.findOne(senderId)?.name ?? 'Un agent';
      await this.notifications.notifyAgentSupervisors(senderId, {
        title: `Message de ${agentName}`,
        message: body.length > 120 ? `${body.slice(0, 117)}...` : body,
        category: 'chat',
        data: { threadUserId },
      });
    } else {
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
