import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Inject,
} from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { InjectRedis } from "@nestjs-modules/ioredis";
import Redis from "ioredis";
import { PrismaService } from "../../core/prisma/prisma.service";
import { INVENTORY_EVENTS } from "@cube/common";
import { ReserveInventoryDto } from "./dto/reserve-inventory.dto";
import { RESERVATION_TTL_SECONDS } from "./utils/inventory.utils";

@Injectable()
export class ReserveService {
  private readonly logger = new Logger(ReserveService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    @Inject("INVENTORY_EVENTS_QUEUE") private readonly eventClient: ClientProxy,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Reserve
  // ─────────────────────────────────────────────────────────────────────────

  async reserve(dto: ReserveInventoryDto) {
    const reservation = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE acquires a row-level lock, preventing concurrent over-reservation.
      // We explicitly alias columns to guard against pg driver casing quirks.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          productId: string;
          quantity: number;
          reserved: number;
          version: number;
          threshold: number;
        }>
      >`
        SELECT
          id            AS "id",
          "productId"   AS "productId",
          quantity      AS "quantity",
          reserved      AS "reserved",
          version       AS "version",
          threshold     AS "threshold"
        FROM "Inventory"
        WHERE "productId" = ${dto.productId}
        FOR UPDATE
      `;

      const inv = rows[0];
      if (!inv) {
        throw new NotFoundException(
          `Inventory for product "${dto.productId}" not found.`,
        );
      }

      const available = inv.quantity - inv.reserved;
      if (available < dto.quantity) {
        throw new ConflictException(
          `Insufficient stock. Requested: ${dto.quantity}, Available: ${available}.`,
        );
      }

      await tx.inventory.update({
        where: { id: inv.id, version: inv.version },
        data: {
          reserved: { increment: dto.quantity },
          version: { increment: 1 },
        },
      });

      const newReservation = await tx.reservation.create({
        data: {
          inventoryId: inv.id,
          quantity: dto.quantity,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          expiresAt: new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000),
        },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryId: inv.id,
          action: "RESERVE",
          quantityDelta: -dto.quantity,
          prevQuantity: inv.quantity,
          newQuantity: inv.quantity, // Physical qty unchanged; only reserved increases
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        },
      });

      // Publish low-stock alert if threshold breached after this reservation
      const newAvailable = available - dto.quantity;
      if (newAvailable < inv.threshold && newAvailable >= 0) {
        this.eventClient.emit(INVENTORY_EVENTS.LOW_STOCK, {
          productId: dto.productId,
          available: newAvailable,
          threshold: inv.threshold,
        });
        this.logger.warn(
          `Low-stock alert: product=${dto.productId} available=${newAvailable} threshold=${inv.threshold}`,
        );
      }

      return newReservation;
    });

    // Redis key set AFTER the transaction commits — avoids atomicity violation.
    await this.redis
      .setex(
        `reservation:expiry:${reservation.id}`,
        RESERVATION_TTL_SECONDS,
        reservation.id,
      )
      .catch((err) =>
        this.logger.error(
          `Redis setex failed for reservation ${reservation.id}: ${err.message}`,
        ),
      );

    this.eventClient.emit(INVENTORY_EVENTS.RESERVED, {
      reservationId: reservation.id,
      productId: dto.productId,
      quantity: dto.quantity,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
    });

    this.logger.log(
      `Reserved ${dto.quantity} units for product ${dto.productId} (reservation=${reservation.id})`,
    );

    return reservation;
  }
}
