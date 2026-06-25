import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";

@Injectable()
export class OfferHelper {
  /**
   * Retrieves flash sale stock for an offer and throws NotFoundException if it doesn't exist.
   */
  async findFlashSaleStock(tx: any, offerId: string) {
    const stock = await tx.flashSaleStock.findUnique({ where: { offerId } });
    if (!stock) {
      throw new NotFoundException(
        `Flash sale stock for offer "${offerId}" not found.`,
      );
    }
    return stock;
  }

  /**
   * Validates coupon code uniqueness and creates coupon code records in uppercase.
   */
  async validateAndCreateCoupons(
    tx: any,
    offerId: string,
    couponCodes: Array<{ code: string }>,
  ) {
    for (const { code } of couponCodes) {
      const normalised = code.toUpperCase();
      const existing = await tx.couponCode.findUnique({
        where: { code: normalised },
      });
      if (existing) {
        throw new ConflictException(
          `Coupon code "${normalised}" is already in use.`,
        );
      }
      await tx.couponCode.create({
        data: { offerId, code: normalised },
      });
    }
  }
}
