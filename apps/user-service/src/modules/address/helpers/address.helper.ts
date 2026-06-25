import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class AddressHelper {
  /**
   * Finds an address and validates that it belongs to the given user.
   * Throws NotFoundException if address doesn't exist.
   * Throws ForbiddenException if address belongs to another user.
   */
  async findAndValidateAddress(tx: any, addressId: string, userId: string) {
    const address = await tx.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException("Address not found.");
    }

    if (address.userId !== userId) {
      throw new ForbiddenException("Access denied.");
    }

    return address;
  }
}
