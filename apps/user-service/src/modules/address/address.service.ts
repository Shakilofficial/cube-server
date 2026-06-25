import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateAddressDto } from "./dto/create-address.dto";
import { UpdateAddressDto } from "./dto/update-address.dto";
import { AddressHelper } from "./helpers/address.helper";
import { MAX_ADDRESSES_PER_USER } from "./utils/address.utils";

@Injectable()
export class AddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addressHelper: AddressHelper,
  ) {}

  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new BadRequestException(
        `Maximum of ${MAX_ADDRESSES_PER_USER} addresses allowed.`,
      );
    }

    // Ensure user profile exists
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: userId },
    });
    if (!profile) {
      throw new NotFoundException(
        "User profile not found. Please complete your profile first.",
      );
    }

    // If setting as default, unset others
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: {
        userId,
        ...dto,
      },
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.addressHelper.findAndValidateAddress(
      this.prisma,
      addressId,
      userId,
    );

    // If setting as default, unset others
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data: dto,
    });
  }

  async remove(userId: string, addressId: string) {
    await this.addressHelper.findAndValidateAddress(
      this.prisma,
      addressId,
      userId,
    );

    await this.prisma.address.delete({ where: { id: addressId } });
    return { message: "Address deleted successfully." };
  }
}
