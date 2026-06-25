import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { PRODUCT_EVENTS } from "@cube/common";
import {
  ProductIndexService,
  ProductDocument,
} from "../indexing/product.index";

/**
 * Consumes product lifecycle events from RabbitMQ and
 * keeps the Elasticsearch "products" index in sync.
 */
@Controller()
export class ProductEventsConsumer {
  private readonly logger = new Logger(ProductEventsConsumer.name);

  constructor(private readonly indexService: ProductIndexService) {}

  @MessagePattern(PRODUCT_EVENTS.CREATED)
  async onProductCreated(@Payload() data: ProductDocument) {
    this.logger.log(`[product.created] Indexing product: ${data.id}`);
    await this.indexService.upsert(data);
  }

  @MessagePattern(PRODUCT_EVENTS.UPDATED)
  async onProductUpdated(@Payload() data: ProductDocument) {
    this.logger.log(`[product.updated] Re-indexing product: ${data.id}`);
    await this.indexService.upsert(data);
  }

  @MessagePattern(PRODUCT_EVENTS.STATUS_CHANGED)
  async onProductStatusChanged(@Payload() data: ProductDocument) {
    this.logger.log(`[product.status_changed] Re-indexing product: ${data.id}`);
    await this.indexService.upsert(data);
  }

  @MessagePattern(PRODUCT_EVENTS.DELETED)
  async onProductDeleted(@Payload() data: { id: string }) {
    this.logger.log(
      `[product.deleted] Removing product from index: ${data.id}`,
    );
    await this.indexService.delete(data.id);
  }
}
