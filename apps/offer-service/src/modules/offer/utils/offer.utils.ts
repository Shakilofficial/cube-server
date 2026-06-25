import { CartItemDto } from "../dto/calculate-offer.dto";

/**
 * Evaluates whether a given offer is eligible for the current cart/order parameters.
 */
export function isOfferEligible(
  offer: any,
  items: CartItemDto[],
  subtotal: number,
): boolean {
  if (offer.minOrderAmount && subtotal < Number(offer.minOrderAmount)) {
    return false;
  }

  if (offer.usageLimit !== null && offer.usageCount >= offer.usageLimit) {
    return false;
  }

  if (offer.type === "FLASH_SALE" && offer.flashSaleStock) {
    const { soldStock, reserved, totalStock } = offer.flashSaleStock;
    if (soldStock + reserved >= totalStock) return false;
  }

  if (offer.applicability === "STORE") return true;

  if (offer.applicability === "PRODUCT") {
    return items.some((item) => offer.applicableIds.includes(item.productId));
  }

  if (offer.applicability === "BRAND") {
    return items.some((item) => offer.applicableIds.includes(item.brandId));
  }

  if (offer.applicability === "CATEGORY") {
    return items.some((item) =>
      item.categoryIds.some((catId) => offer.applicableIds.includes(catId)),
    );
  }

  return false;
}

/**
 * Computes the discount value for an offer given the qualified items and subtotal.
 */
export function computeOfferDiscount(
  offer: any,
  items: CartItemDto[],
  subtotal: number,
  logger?: { warn: (msg: string) => void },
): number {
  // Narrow items to only those that qualify under the offer's scope
  let eligible = items;
  if (offer.applicability === "PRODUCT") {
    eligible = items.filter((i) => offer.applicableIds.includes(i.productId));
  } else if (offer.applicability === "BRAND") {
    eligible = items.filter((i) => offer.applicableIds.includes(i.brandId));
  } else if (offer.applicability === "CATEGORY") {
    eligible = items.filter((i) =>
      i.categoryIds.some((catId) => offer.applicableIds.includes(catId)),
    );
  }

  if (!eligible.length) return 0;

  const eligibleSubtotal = eligible.reduce(
    (sum, i) => sum + i.quantity * i.unitPrice,
    0,
  );
  const eligibleQty = eligible.reduce((sum, i) => sum + i.quantity, 0);

  switch (offer.type) {
    case "PERCENTAGE":
    case "FLASH_SALE": {
      const raw = eligibleSubtotal * (Number(offer.value) / 100);
      return offer.maxDiscount ? Math.min(raw, Number(offer.maxDiscount)) : raw;
    }

    case "FIXED_AMOUNT":
      return Math.min(Number(offer.value), eligibleSubtotal);

    case "BOGO": {
      return eligible.reduce((discount, item) => {
        if (item.quantity >= 2) {
          return discount + Math.floor(item.quantity / 2) * item.unitPrice;
        }
        return discount;
      }, 0);
    }

    case "TIERED": {
      try {
        const tiers = JSON.parse(String(offer.value)) as Array<{
          minQty: number;
          pct: number;
        }>;
        const tier = tiers
          .filter((t) => eligibleQty >= t.minQty)
          .sort((a, b) => b.pct - a.pct)[0];
        return tier ? eligibleSubtotal * (tier.pct / 100) : 0;
      } catch {
        if (logger) {
          logger.warn(
            `Failed to parse TIERED offer value for offer ${offer.id}`,
          );
        }
        return 0;
      }
    }

    case "FREE_SHIPPING":
      return 0; // Applied separately at cart level

    default:
      return 0;
  }
}
