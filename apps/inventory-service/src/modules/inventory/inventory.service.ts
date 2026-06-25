import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
} from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { InjectRedis } from "@nestjs-modules/ioredis";
import Redis from "ioredis";
import { PrismaService } from "../../core/prisma/prisma.service";
import { INVENTORY_EVENTS } from "@cube/common";
import { ConfirmReleaseDto } from "./dto/confirm-release.dto";
import { RestockDto } from "./dto/restock.dto";
import { BulkUpdateItemDto } from "./dto/bulk-update.dto";
import { findActiveReservationAndInventory } from "./helpers/inventory.helper";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    @Inject("INVENTORY_EVENTS_QUEUE") private readonly eventClient: ClientProxy,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  async getStock(productId: string) {
    const inv = await this.prisma.inventory.findUnique({
      where: { productId },
      include: {
        reservations: { where: { status: "ACTIVE" } },
        _count: { select: { reservations: true, history: true } },
      },
    });
    if (!inv) {
      throw new NotFoundException(
        `Inventory for product "${productId}" not found.`,
      );
    }

    return { ...inv, available: inv.quantity - inv.reserved };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Confirm
  // ─────────────────────────────────────────────────────────────────────────

  async confirm(dto: ConfirmReleaseDto) {
    let reservationId: string | null = null;
    let productId: string | null = null;
    let confirmedQty = 0;

    await this.prisma.$transaction(async (tx) => {
      const { reservation, inventory: inv } =
        await findActiveReservationAndInventory(
          tx,
          dto.referenceId,
          dto.referenceType,
        );

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "CONFIRMED" },
      });

      await tx.inventory.update({
        where: { id: inv.id, version: inv.version },
        data: {
          quantity: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
          version: { increment: 1 },
        },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryId: inv.id,
          action: "CONFIRM",
          quantityDelta: -reservation.quantity,
          prevQuantity: inv.quantity,
          newQuantity: inv.quantity - reservation.quantity,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        },
      });

      // Capture values needed for post-transaction side effects
      reservationId = reservation.id;
      productId = inv.productId;
      confirmedQty = reservation.quantity;
    });

    // Redis del and event publish happen AFTER transaction commits — preserving atomicity.
    if (reservationId) {
      await this.redis
        .del(`reservation:expiry:${reservationId}`)
        .catch((err) =>
          this.logger.error(
            `Redis del failed for reservation ${reservationId}: ${err.message}`,
          ),
        );
    }

    this.eventClient.emit(INVENTORY_EVENTS.CONFIRMED, {
      productId,
      quantity: confirmedQty,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
    });

    this.logger.log(
      `Confirmed reservation ${reservationId} — deducted ${confirmedQty} units from product ${productId}`,
    );

    return { message: "Reservation confirmed and stock deducted." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Release
  // ─────────────────────────────────────────────────────────────────────────

  async release(dto: ConfirmReleaseDto) {
    let reservationId: string | null = null;
    let productId: string | null = null;
    let releasedQty = 0;

    await this.prisma.$transaction(async (tx) => {
      const { reservation, inventory: inv } =
        await findActiveReservationAndInventory(
          tx,
          dto.referenceId,
          dto.referenceType,
        );

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "RELEASED" },
      });

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
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        },
      });

      reservationId = reservation.id;
      productId = inv.productId;
      releasedQty = reservation.quantity;
    });

    // Side effects after transaction commits
    if (reservationId) {
      await this.redis
        .del(`reservation:expiry:${reservationId}`)
        .catch((err) =>
          this.logger.error(
            `Redis del failed for reservation ${reservationId}: ${err.message}`,
          ),
        );
    }

    this.eventClient.emit(INVENTORY_EVENTS.RELEASED, {
      productId,
      quantity: releasedQty,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
    });

    this.logger.log(
      `Released reservation ${reservationId} — restored ${releasedQty} units for product ${productId}`,
    );

    return { message: "Reservation released successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Restock
  // ─────────────────────────────────────────────────────────────────────────

  async restock(dto: RestockDto) {
    if (dto.quantity < 0) {
      throw new BadRequestException("Restock quantity must be non-negative.");
    }

    return this.prisma.$transaction(async (tx) => {
      let inv = await tx.inventory.findUnique({
        where: { productId: dto.productId },
      });

      if (!inv) {
        if (!dto.sku) {
          throw new BadRequestException(
            `SKU is required to initialise inventory for product "${dto.productId}".`,
          );
        }

        const skuConflict = await tx.inventory.findUnique({
          where: { sku: dto.sku },
        });
        if (skuConflict) {
          throw new ConflictException(
            `SKU "${dto.sku}" is already in use by another product.`,
          );
        }

        inv = await tx.inventory.create({
          data: {
            productId: dto.productId,
            sku: dto.sku,
            quantity: dto.quantity,
            reserved: 0,
            threshold: 5,
          },
        });

        await tx.inventoryHistory.create({
          data: {
            inventoryId: inv.id,
            action: "RESTOCK",
            quantityDelta: dto.quantity,
            prevQuantity: 0,
            newQuantity: dto.quantity,
          },
        });

        this.logger.log(
          `Initialised inventory for product ${dto.productId} with ${dto.quantity} units.`,
        );
        return { ...inv, available: inv.quantity - inv.reserved };
      }

      const prevQuantity = inv.quantity;
      const updated = await tx.inventory.update({
        where: { id: inv.id, version: inv.version },
        data: {
          quantity: { increment: dto.quantity },
          version: { increment: 1 },
        },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryId: inv.id,
          action: "RESTOCK",
          quantityDelta: dto.quantity,
          prevQuantity,
          newQuantity: prevQuantity + dto.quantity,
        },
      });

      this.logger.log(
        `Restocked product ${dto.productId}: +${dto.quantity} units.`,
      );
      return { ...updated, available: updated.quantity - updated.reserved };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bulk Update
  // ─────────────────────────────────────────────────────────────────────────

  async bulkUpdate(items: BulkUpdateItemDto[]) {
    // Validate ALL items before opening any transaction to avoid partial rollbacks
    for (const item of items) {
      if (item.quantity < 0) {
        throw new BadRequestException(
          `Quantity for product "${item.productId}" must be non-negative.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = [];

      for (const item of items) {
        let inv = await tx.inventory.findUnique({
          where: { productId: item.productId },
        });

        if (inv) {
          const prevQty = inv.quantity;
          inv = await tx.inventory.update({
            where: { id: inv.id, version: inv.version },
            data: {
              quantity: item.quantity,
              threshold: item.threshold ?? inv.threshold,
              version: { increment: 1 },
            },
          });

          await tx.inventoryHistory.create({
            data: {
              inventoryId: inv.id,
              action: "RESTOCK",
              quantityDelta: item.quantity - prevQty,
              prevQuantity: prevQty,
              newQuantity: item.quantity,
            },
          });
        } else {
          inv = await tx.inventory.create({
            data: {
              productId: item.productId,
              sku: item.sku,
              quantity: item.quantity,
              threshold: item.threshold ?? 5,
            },
          });

          await tx.inventoryHistory.create({
            data: {
              inventoryId: inv.id,
              action: "RESTOCK",
              quantityDelta: item.quantity,
              prevQuantity: 0,
              newQuantity: item.quantity,
            },
          });
        }

        updated.push({ ...inv, available: inv.quantity - inv.reserved });
      }

      this.logger.log(`Bulk updated ${updated.length} inventory records.`);
      return updated;
    });
  }
}
