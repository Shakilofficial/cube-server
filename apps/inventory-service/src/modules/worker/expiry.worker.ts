import { INVENTORY_EVENTS } from "@cube/common";
import {
  Controller,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ClientProxy, EventPattern, Payload } from "@nestjs/microservices";
import Redis from "ioredis";
import { PrismaService } from "../../core/prisma/prisma.service";

/**
 * ExpiryWorker is declared as @Controller() (not @Injectable()) so that NestJS
 * wires its @EventPattern handlers to the hybrid app's RabbitMQ microservice transport.
 */
@Controller()
export class ExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryWorker.name);
  private subRedis: Redis;
  private fallbackInterval: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject("RESERVATION_EXPIRY_QUEUE")
    private readonly expiryQueueClient: ClientProxy,
    @Inject("INVENTORY_EVENTS_QUEUE") private readonly eventClient: ClientProxy,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.subRedis = new Redis(redisUrl);

    try {
      await this.subRedis.config("SET", "notify-keyspace-events", "Ex");
      await this.subRedis.subscribe("__keyevent@0__:expired");

      this.subRedis.on("message", (_channel: string, message: string) => {
        if (message.startsWith("reservation:expiry:")) {
          const reservationId = message.replace("reservation:expiry:", "");
          this.logger.log(
            `Redis expiry detected for reservation ${reservationId}`,
          );
          this.expiryQueueClient.emit("reservation.expire", { reservationId });
        }
      });

      this.logger.log("Redis keyspace notification listener initialised.");
    } catch (err: any) {
      this.logger.error(
        `Failed to initialise Redis keyspace listener: ${err.message}`,
      );
    }

    // Fallback: poll DB every 60 s for reservations whose Redis key was evicted
    this.fallbackInterval = setInterval(
      () => this.runFallbackScanner(),
      60_000,
    );
    this.logger.log(
      "Periodic DB expiration fallback scanner started (60 s interval).",
    );
  }

  onModuleDestroy() {
    if (this.subRedis) this.subRedis.disconnect();
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback Scanner
  // ─────────────────────────────────────────────────────────────────────────

  async runFallbackScanner() {
    try {
      const expired = await this.prisma.reservation.findMany({
        where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
        select: { id: true },
      });

      for (const { id } of expired) {
        this.logger.log(
          `Fallback: dispatching expiration for reservation ${id}`,
        );
        this.expiryQueueClient.emit("reservation.expire", {
          reservationId: id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Fallback scanner error: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Consumer — RabbitMQ RESERVATION_EXPIRY_QUEUE
  // ─────────────────────────────────────────────────────────────────────────

  @EventPattern("reservation.expire")
  async handleExpiration(@Payload() data: { reservationId: string }) {
    const { reservationId } = data;
    this.logger.log(`Processing expiration for reservation ${reservationId}`);

    try {
      let productId: string | null = null;
      let releasedQty = 0;

      await this.prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
        });

        if (!reservation || reservation.status !== "ACTIVE") {
          this.logger.log(
            `Reservation ${reservationId} is not active — skipping.`,
          );
          return;
        }

        if (reservation.expiresAt > new Date()) {
          this.logger.log(
            `Reservation ${reservationId} not yet expired — skipping.`,
          );
          return;
        }

        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "EXPIRED" },
        });

        const inv = await tx.inventory.findUnique({
          where: { id: reservation.inventoryId },
        });
        if (!inv) return;

        await tx.inventory.update({
          where: { id: inv.id, version: inv.version },
          data: {
            reserved: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
        });

        await tx.inventoryHistory.create({
          data: {
            inventoryId: inv.id,
            action: "RELEASE",
            quantityDelta: reservation.quantity,
            prevQuantity: inv.quantity,
            newQuantity: inv.quantity,
            referenceType: reservation.referenceType,
            referenceId: reservation.referenceId,
          },
        });

        productId = inv.productId;
        releasedQty = reservation.quantity;
      });

      // Publish event AFTER transaction commits
      if (productId) {
        this.eventClient.emit(INVENTORY_EVENTS.RELEASED, {
          productId,
          quantity: releasedQty,
          reason: "EXPIRED",
        });

        this.logger.log(
          `Reservation ${reservationId} expired — released ${releasedQty} units for product ${productId}.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to expire reservation ${reservationId}: ${err.message}`,
      );
    }
  }
}
