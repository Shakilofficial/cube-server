import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CartItemDto } from "./dto/calculate-offer.dto";
import { isOfferEligible, computeOfferDiscount } from "./utils/offer.utils";

export interface OfferResult {
  discount: number;
  offer: any | null;
}

@Injectable()
export class OfferCalculatorService {
  private readonly logger = new Logger(OfferCalculatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Calculate
  // ─────────────────────────────────────────────────────────────────────────

  async calculateBestOffer(
    items: CartItemDto[],
    subtotal: number,
  ): Promise<OfferResult> {
    const now = new Date();

    const activeOffers = await this.prisma.offer.findMany({
      where: {
        status: "ACTIVE",
        startAt: { lte: now },
        endAt: { gte: now },
      },
      include: { flashSaleStock: true },
    });

    const eligibleOffers = activeOffers.filter((offer) =>
      isOfferEligible(offer, items, subtotal),
    );

    if (!eligibleOffers.length) return { discount: 0, offer: null };

    const results = eligibleOffers.map((offer) => ({
      offer,
      discount: computeOfferDiscount(offer, items, subtotal, this.logger),
    }));

    return results.reduce((best, curr) =>
      curr.discount > best.discount ? curr : best,
    );
  }
}
