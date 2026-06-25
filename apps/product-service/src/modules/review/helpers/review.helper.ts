import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ProductHelper } from "../../product/helpers/product.helper";
import { PRODUCT_EVENTS } from "@cube/common";
import { PRODUCT_INCLUDE } from "../../product/utils/product.utils";

@Injectable()
export class ReviewHelper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productHelper: ProductHelper,
  ) {}

  async syncProductRating(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        ...PRODUCT_INCLUDE,
      },
    });
    if (!product) return;

    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);
  }
}
