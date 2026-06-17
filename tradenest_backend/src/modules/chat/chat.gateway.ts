import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type JoinPayload = {
  userId?: string;
  conversationId?: string;
};

type SendPayload = JoinPayload & {
  body?: string;
  attachmentUrl?: string;
};

type SocketData = {
  userId?: string;
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(socket: Socket) {
    const userId = this.extractUserId(socket);

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      socket.disconnect(true);
      return;
    }

    this.setSocketUserId(socket, userId);
    await socket.join(this.getUserRoom(userId));
  }

  @SubscribeMessage('chat:join')
  async joinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const userId = this.getSocketUserId(socket);

    if (!userId || userId !== payload.userId) {
      return { ok: false, message: 'Unauthorized socket session' };
    }

    if (!payload.conversationId) {
      return { ok: false, message: 'conversationId is required' };
    }

    await this.ensureParticipant(userId, payload.conversationId);
    await socket.join(this.getConversationRoom(payload.conversationId));

    return { ok: true, room: this.getConversationRoom(payload.conversationId) };
  }

  @SubscribeMessage('chat:send')
  async sendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SendPayload,
  ) {
    const userId = this.getSocketUserId(socket);

    if (!userId || userId !== payload.userId) {
      return { ok: false, message: 'Unauthorized socket session' };
    }

    if (!payload.conversationId || !payload.body?.trim()) {
      return {
        ok: false,
        message: 'conversationId and body are required',
      };
    }

    await this.ensureParticipant(userId, payload.conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: payload.conversationId!,
          senderId: userId,
          body: payload.body!.trim(),
          attachmentUrl: payload.attachmentUrl,
        },
        include: {
          sender: { select: { id: true, name: true, image: true } },
        },
      });

      await tx.conversation.update({
        where: { id: payload.conversationId },
        data: { lastMessageAt: created.createdAt },
      });

      return created;
    });

    this.emitToConversation(payload.conversationId, 'chat:message', message);
    await this.notifyOtherParticipants(
      payload.conversationId,
      userId,
      message.id,
    );

    return { ok: true, message };
  }

  emitToConversation(
    conversationId: string,
    event: string,
    payload: unknown,
  ): void {
    this.server
      .to(this.getConversationRoom(conversationId))
      .emit(event, payload);
  }

  private extractUserId(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { userId?: string };
    const query = socket.handshake.query as { userId?: string };
    return auth.userId ?? query.userId;
  }

  private getSocketUserId(socket: Socket): string | undefined {
    return (socket.data as SocketData).userId;
  }

  private setSocketUserId(socket: Socket, userId: string): void {
    (socket.data as SocketData).userId = userId;
  }

  private async ensureParticipant(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error('You are not a participant of this conversation');
    }

    return participant;
  }

  private async notifyOtherParticipants(
    conversationId: string,
    senderId: string,
    messageId: string,
  ) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: senderId },
      },
    });

    await Promise.all(
      participants.map((participant) =>
        this.notificationsService.create({
          userId: participant.userId,
          type: NotificationType.MESSAGE,
          title: 'New message',
          body: 'You have a new message',
          data: { conversationId, messageId },
        }),
      ),
    );
  }

  private getConversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }
}
