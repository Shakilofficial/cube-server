-- CreateIndex
CREATE INDEX "Reservation_inventoryId_idx" ON "Reservation"("inventoryId");

-- AddCheckConstraint
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_reserved_check" CHECK ("reserved" >= 0 AND "reserved" <= "quantity");
