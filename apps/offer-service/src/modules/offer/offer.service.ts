import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { OfferHelper } from "./helpers/offer.helper";
import { paginationHelper } from "@cube/common";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { UpdateOfferDto } from "./dto/update-offer.dto";
import { QueryOfferDto } from "./dto/query-offer.dto";
import { OfferType, OfferStatus } from "./enums/offer.enums";

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerHelper: OfferHelper,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateOfferDto) {
    const { flashSaleStock, couponCodes, ...offerData } = dto;

    if (new Date(offerData.startAt) >= new Date(offerData.endAt)) {
      throw new BadRequestException("startAt must be before endAt.");
    }

    if (offerData.type === OfferType.FLASH_SALE && !flashSaleStock) {
      throw new BadRequestException(
        "flashSaleStock is required for FLASH_SALE type offers.",
      );
    }

    this.logger.log(
      `Creating offer: name="${offerData.name}", type=${offerData.type}`,
    );

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.create({
        data: {
          name: offerData.name,
          type: offerData.type,
          value: offerData.value,
          maxDiscount: offerData.maxDiscount ?? null,
          minOrderAmount: offerData.minOrderAmount ?? null,
          startAt: new Date(offerData.startAt),
          endAt: new Date(offerData.endAt),
          usageLimit: offerData.usageLimit ?? null,
          perUserLimit: offerData.perUserLimit ?? null,
          applicability: offerData.applicability ?? "STORE",
          applicableIds: offerData.applicableIds ?? [],
        },
      });

      if (flashSaleStock) {
        await tx.flashSaleStock.create({
          data: { offerId: offer.id, totalStock: flashSaleStock.totalStock },
        });
      }

      if (couponCodes?.length) {
        await this.offerHelper.validateAndCreateCoupons(
          tx,
          offer.id,
          couponCodes,
        );
      }

      return tx.offer.findUnique({
        where: { id: offer.id },
        include: { flashSaleStock: true, couponCodes: true },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(query: QueryOfferDto) {
    const { page, limit, skip } = paginationHelper.calculatePagination(query);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { flashSaleStock: true, couponCodes: true },
      }),
    ]);

    return { meta: { page, limit, total }, data };
  }

  async findOne(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: { flashSaleStock: true, couponCodes: true },
    });
    if (!offer) throw new NotFoundException(`Offer with ID "${id}" not found.`);
    return offer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateOfferDto) {
    await this.findOne(id);

    const { flashSaleStock, couponCodes, ...offerData } = dto;

    if (offerData.startAt && offerData.endAt) {
      if (new Date(offerData.startAt) >= new Date(offerData.endAt)) {
        throw new BadRequestException("startAt must be before endAt.");
      }
    }

    this.logger.log(`Updating offer ${id}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id },
        data: {
          ...(offerData.name && { name: offerData.name }),
          ...(offerData.type && { type: offerData.type }),
          ...(offerData.value !== undefined && { value: offerData.value }),
          ...(offerData.maxDiscount !== undefined && {
            maxDiscount: offerData.maxDiscount,
          }),
          ...(offerData.minOrderAmount !== undefined && {
            minOrderAmount: offerData.minOrderAmount,
          }),
          ...(offerData.startAt && { startAt: new Date(offerData.startAt) }),
          ...(offerData.endAt && { endAt: new Date(offerData.endAt) }),
          ...(offerData.usageLimit !== undefined && {
            usageLimit: offerData.usageLimit,
          }),
          ...(offerData.perUserLimit !== undefined && {
            perUserLimit: offerData.perUserLimit,
          }),
          ...(offerData.applicability && {
            applicability: offerData.applicability,
          }),
          ...(offerData.applicableIds && {
            applicableIds: offerData.applicableIds,
          }),
        },
      });

      if (flashSaleStock) {
        await tx.flashSaleStock.upsert({
          where: { offerId: id },
          update: { totalStock: flashSaleStock.totalStock },
          create: { offerId: id, totalStock: flashSaleStock.totalStock },
        });
      }

      if (couponCodes) {
        await tx.couponCode.deleteMany({ where: { offerId: id } });
        await this.offerHelper.validateAndCreateCoupons(tx, id, couponCodes);
      }

      return tx.offer.findUnique({
        where: { id },
        include: { flashSaleStock: true, couponCodes: true },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete (soft-disable)
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    await this.findOne(id);
    this.logger.log(`Disabling offer ${id}`);
    await this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.DISABLED },
    });
    return { message: "Offer disabled successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Flash Sale Stock
  // ─────────────────────────────────────────────────────────────────────────

  async reserveFlashSaleStock(offerId: string, quantity: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await this.offerHelper.findFlashSaleStock(tx, offerId);

      const available = stock.totalStock - stock.soldStock - stock.reserved;
      if (available < quantity) {
        throw new BadRequestException(
          `Insufficient flash sale stock. Requested: ${quantity}, Available: ${available}.`,
        );
      }

      await tx.flashSaleStock.update({
        where: { id: stock.id, version: stock.version },
        data: { reserved: { increment: quantity }, version: { increment: 1 } },
      });

      this.logger.log(`Flash sale ${offerId}: reserved ${quantity} units.`);
      return { message: "Flash sale stock reserved." };
    });
  }

  async confirmFlashSaleStock(offerId: string, quantity: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await this.offerHelper.findFlashSaleStock(tx, offerId);

      if (stock.reserved < quantity) {
        throw new BadRequestException(
          `Cannot confirm ${quantity} — only ${stock.reserved} units are reserved.`,
        );
      }

      await tx.flashSaleStock.update({
        where: { id: stock.id, version: stock.version },
        data: {
          soldStock: { increment: quantity },
          reserved: { decrement: quantity },
          version: { increment: 1 },
        },
      });

      await tx.offer.update({
        where: { id: offerId },
        data: { usageCount: { increment: quantity } },
      });

      this.logger.log(
        `Flash sale ${offerId}: confirmed ${quantity} units sold.`,
      );
      return { message: "Flash sale stock confirmed." };
    });
  }

  async releaseFlashSaleStock(offerId: string, quantity: number) {
    return this.prisma.$transaction(async (tx) => {
      const stock = await this.offerHelper.findFlashSaleStock(tx, offerId);

      if (stock.reserved < quantity) {
        throw new BadRequestException(
          `Cannot release ${quantity} — only ${stock.reserved} units are reserved.`,
        );
      }

      await tx.flashSaleStock.update({
        where: { id: stock.id, version: stock.version },
        data: { reserved: { decrement: quantity }, version: { increment: 1 } },
      });

      this.logger.log(`Flash sale ${offerId}: released ${quantity} units.`);
      return { message: "Flash sale stock released." };
    });
  }
}
