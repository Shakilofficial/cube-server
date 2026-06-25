import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { ReserveService } from "./reserve.service";
import { createRabbitMQClient } from "@cube/messaging";

const rmqClient = createRabbitMQClient("INVENTORY_EVENTS_QUEUE");

@Module({
  imports: [rmqClient],
  controllers: [InventoryController],
  providers: [InventoryService, ReserveService],
  exports: [InventoryService, ReserveService, rmqClient],
})
export class InventoryModule {}
