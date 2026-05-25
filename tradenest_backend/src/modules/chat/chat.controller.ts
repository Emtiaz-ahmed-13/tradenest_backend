import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  createConversation(
    @Session() session: UserSession,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(session.user.id, dto);
  }

  @Get('conversations')
  listConversations(@Session() session: UserSession) {
    return this.chatService.listConversations(session.user.id);
  }

  @Get('conversations/:id')
  getConversation(@Session() session: UserSession, @Param('id') id: string) {
    return this.chatService.getConversation(session.user.id, id);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(session.user.id, id, dto);
  }

  @Patch('conversations/:id/read')
  markRead(@Session() session: UserSession, @Param('id') id: string) {
    return this.chatService.markRead(session.user.id, id);
  }
}
