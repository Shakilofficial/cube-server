import { NotFoundException } from "@nestjs/common";

/**
 * Shared helper function to retrieve and validate an active reservation and its linked inventory record.
 */
export async function findActiveReservationAndInventory(
  tx: any,
  referenceId: string,
  referenceType: string,
) {
  const reservation = await tx.reservation.findFirst({
    where: {
      referenceId,
      referenceType,
      status: "ACTIVE",
    },
  });

  if (!reservation) {
    throw new NotFoundException(
      `Active reservation for reference "${referenceId}" (${referenceType}) not found.`,
    );
  }

  const inv = await tx.inventory.findUnique({
    where: { id: reservation.inventoryId },
  });
  if (!inv) throw new NotFoundException("Inventory record not found.");

  return { reservation, inventory: inv };
}
