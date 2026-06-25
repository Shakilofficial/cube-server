/**
 * Enums shared across the offer module (DTO, service, controller).
 * Centralising here avoids raw-string literals scattered through the codebase.
 */

export enum OfferType {
  PERCENTAGE = "PERCENTAGE",
  FIXED_AMOUNT = "FIXED_AMOUNT",
  FLASH_SALE = "FLASH_SALE",
  BOGO = "BOGO",
  TIERED = "TIERED",
  FREE_SHIPPING = "FREE_SHIPPING",
}

export enum OfferStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  EXPIRED = "EXPIRED",
}

export enum ApplicabilityScope {
  STORE = "STORE",
  BRAND = "BRAND",
  CATEGORY = "CATEGORY",
  PRODUCT = "PRODUCT",
}
