import { Module } from "@nestjs/common";
import { ProductController } from "./product.controller";
import { ProductService } from "./product.service";
import { createRabbitMQClient } from "@cube/messaging";
import { ProductHelper } from "./helpers/product.helper";

const rmqClient = createRabbitMQClient("PRODUCT_EVENTS_QUEUE");

@Module({
  imports: [rmqClient],
  controllers: [ProductController],
  providers: [ProductService, ProductHelper],
  exports: [ProductService, ProductHelper, rmqClient],
})
export class ProductModule {}
