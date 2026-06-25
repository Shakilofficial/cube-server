import { Module } from "@nestjs/common";
import { ExpiryWorker } from "./expiry.worker";
import { InventoryModule } from "../inventory/inventory.module";
import { createRabbitMQClient } from "@cube/messaging";

/**
 * WorkerModule registers only the RESERVATION_EXPIRY_QUEUE client.
 * The INVENTORY_EVENTS_QUEUE client is inherited via InventoryModule exports,
 * avoiding duplicate client registrations to the same queue.
 */
@Module({
  imports: [createRabbitMQClient("RESERVATION_EXPIRY_QUEUE"), InventoryModule],
  controllers: [ExpiryWorker],
})
export class WorkerModule {}
