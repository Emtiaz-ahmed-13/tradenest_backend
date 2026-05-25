import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  private server!: Server;

  @SubscribeMessage('notifications:join')
  joinUserRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { userId?: string },
  ) {
    if (!payload.userId) {
      return { ok: false, message: 'userId is required' };
    }

    void socket.join(this.getUserRoom(payload.userId));

    return { ok: true, room: this.getUserRoom(payload.userId) };
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(this.getUserRoom(userId)).emit(event, payload);
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }
}
