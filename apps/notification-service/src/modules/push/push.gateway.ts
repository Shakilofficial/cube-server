import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/push",
})
export class PushGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger("PushGateway");
  /** Map userId → Set of socket IDs */
  private userSockets = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      let sockets = this.userSockets.get(userId);
      if (!sockets) {
        sockets = new Set();
        this.userSockets.set(userId, sockets);
      }
      sockets.add(client.id);
      this.logger.log(`Client connected: user ${userId} (socket ${client.id})`);
    } else {
      this.logger.log(`Client connected: anonymous (socket ${client.id})`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        this.logger.log(
          `Client disconnected: user ${userId} (socket ${client.id})`,
        );
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }

  sendPushToUser(userId: string, event: string, payload: any): boolean {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, payload);
      }
      this.logger.log(
        `Sent push notification to user ${userId} on event "${event}"`,
      );
      return true;
    }
    this.logger.warn(
      `User ${userId} not connected via WebSockets. Notification not delivered.`,
    );
    return false;
  }

  broadcastPush(event: string, payload: any) {
    this.server.emit(event, payload);
    this.logger.log(
      `Broadcasted push notification on event "${event}" to all connected clients.`,
    );
  }
}
