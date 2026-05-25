import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { NotificationType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from './chat.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  private readonly conversationInclude: Prisma.ConversationInclude = {
    product: {
      select: { id: true, title: true, slug: true },
    },
    participants: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            sellerProfile: { select: { shopName: true, slug: true } },
          },
        },
      },
    },
    messages: {
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createConversation(userId: string, dto: CreateConversationDto) {
    if (userId === dto.participantId) {
      throw new BadRequestException('Cannot start conversation with yourself');
    }

    const participant = await this.prisma.user.findUnique({
      where: { id: dto.participantId },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        productId: dto.productId,
        participants: {
          create: [{ userId }, { userId: dto.participantId }],
        },
      },
      include: this.conversationInclude,
    });

    await this.notificationsService.create({
      userId: dto.participantId,
      type: NotificationType.MESSAGE,
      title: 'New conversation',
      body: 'A buyer/seller started a conversation with you.',
      data: { conversationId: conversation.id, productId: dto.productId },
    });

    return { message: 'Conversation created', data: conversation };
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: this.conversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });

    return { message: 'Conversations retrieved', data: conversations };
  }

  async getConversation(userId: string, conversationId: string) {
    await this.ensureParticipant(userId, conversationId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        ...this.conversationInclude,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return { message: 'Conversation retrieved', data: conversation };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    await this.ensureParticipant(userId, conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          body: dto.body.trim(),
          attachmentUrl: dto.attachmentUrl,
        },
        include: {
          sender: { select: { id: true, name: true, image: true } },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });

      return created;
    });

    this.chatGateway.emitToConversation(
      conversationId,
      'chat:message',
      message,
    );
    await this.notifyOtherParticipants(conversationId, userId, message.id);

    return { message: 'Message sent', data: message };
  }

  async markRead(userId: string, conversationId: string) {
    await this.ensureParticipant(userId, conversationId);

    const participant = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    this.chatGateway.emitToConversation(conversationId, 'chat:read', {
      conversationId,
      userId,
      lastReadAt: participant.lastReadAt,
    });

    return { message: 'Conversation marked as read', data: participant };
  }

  private async ensureParticipant(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant');
    }

    return participant;
  }

  private async notifyOtherParticipants(
    conversationId: string,
    senderId: string,
    messageId: string,
  ) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } },
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
}
