import {
  ConnectedSocket,
  MessageBody,
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

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @SubscribeMessage('chat:join')
  async joinConversation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    if (!payload.userId || !payload.conversationId) {
      return { ok: false, message: 'userId and conversationId are required' };
    }

    await this.ensureParticipant(payload.userId, payload.conversationId);
    await socket.join(this.getConversationRoom(payload.conversationId));

    return { ok: true, room: this.getConversationRoom(payload.conversationId) };
  }

  @SubscribeMessage('chat:send')
  async sendMessage(@MessageBody() payload: SendPayload) {
    if (!payload.userId || !payload.conversationId || !payload.body?.trim()) {
      return {
        ok: false,
        message: 'userId, conversationId and body are required',
      };
    }

    await this.ensureParticipant(payload.userId, payload.conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: payload.conversationId!,
          senderId: payload.userId!,
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
      payload.userId,
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
}
