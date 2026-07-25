-- DropIndex: redundant with the unique index already present on this column
DROP INDEX "CouponCode_code_idx";

-- CreateIndex
CREATE INDEX "CouponCode_offerId_idx" ON "CouponCode"("offerId");

-- CreateIndex
CREATE INDEX "Offer_status_startAt_endAt_idx" ON "Offer"("status", "startAt", "endAt");

-- AddCheckConstraint
ALTER TABLE "FlashSaleStock" ADD CONSTRAINT "FlashSaleStock_stock_check"
  CHECK ("soldStock" >= 0 AND "reserved" >= 0 AND "totalStock" >= 0
         AND "soldStock" + "reserved" <= "totalStock");
