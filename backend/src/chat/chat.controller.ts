import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { SupervisorScopeService } from '../common/supervisor-scope/supervisor-scope.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly scope: SupervisorScopeService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('threads')
  listThreads(@Req() req: Request) {
    const user = req.user as any;
    return this.chatService.listThreads(user.sub, user.role);
  }

  @Get('threads/me')
  getMyThread(@Req() req: Request) {
    return this.chatService.getThread((req.user as any)?.sub);
  }

  @Post('threads/me/messages')
  sendFromAgent(@Body() dto: SendMessageDto, @Req() req: Request) {
    const user = req.user as any;
    return this.chatService.sendMessage(user.sub, user.sub, user.role, dto.body);
  }

  @Patch('threads/me/read')
  markMyThreadRead(@Req() req: Request) {
    return this.chatService.markRead((req.user as any)?.sub, (req.user as any)?.sub);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Get('threads/:userId')
  async getThread(@Param('userId') userId: string, @Req() req: Request) {
    const user = req.user as any;
    await this.chatService.assertThreadAccessible(userId, user.sub, user.role);
    return this.chatService.getThread(userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('threads/:userId/messages')
  async sendToAgent(@Param('userId') userId: string, @Body() dto: SendMessageDto, @Req() req: Request) {
    const user = req.user as any;
    await this.chatService.assertThreadAccessible(userId, user.sub, user.role);
    return this.chatService.sendMessage(userId, user.sub, user.role, dto.body);
  }

  /** Message à toute l'équipe d'un site du superviseur. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Post('sites/:siteId/broadcast')
  async broadcastToSite(@Param('siteId') siteId: string, @Body() dto: SendMessageDto, @Req() req: Request) {
    const user = req.user as any;
    await this.scope.assertSite(user, siteId);
    return this.chatService.broadcastToSite(siteId, user.sub, user.role, dto.body);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  @Patch('threads/:userId/read')
  async markThreadRead(@Param('userId') userId: string, @Req() req: Request) {
    const user = req.user as any;
    await this.chatService.assertThreadAccessible(userId, user.sub, user.role);
    return this.chatService.markRead(userId, user.sub);
  }
}
