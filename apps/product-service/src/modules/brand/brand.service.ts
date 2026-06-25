import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateBrandDto } from "./dto/create-brand.dto";
import { UpdateBrandDto } from "./dto/update-brand.dto";
import { paginationHelper } from "@cube/common";
import { generateSlug } from "./utils/brand.utils";
import { StorageService } from "@cube/storage";
import { ProductHelper } from "../product/helpers/product.helper";

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly productHelper: ProductHelper,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateBrandDto, id?: string) {
    const slug = generateSlug(dto.name);

    const existing = await this.prisma.brand.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });
    if (existing) {
      throw new ConflictException("A brand with this name already exists.");
    }

    return this.prisma.brand.create({
      data: {
        id,
        name: dto.name,
        slug,
        description: dto.description,
        logoUrl: dto.logoUrl,
        website: dto.website,
        seoTitle: dto.seoTitle,
        seoDesc: dto.seoDesc,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(options: { page?: number; limit?: number; search?: string }) {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);

    const where: any = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: "insensitive" } },
            { description: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [total, data] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      }),
    ]);

    return { meta: { page, limit, total }, data };
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException(`Brand with ID ${id} not found.`);
    return brand;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateBrandDto) {
    const existing = await this.findOne(id);

    const data: any = { ...dto };
    let nameChanged = false;

    if (dto.name && dto.name !== existing.name) {
      const slug = generateSlug(dto.name);
      const conflict = await this.prisma.brand.findFirst({
        where: { OR: [{ name: dto.name }, { slug }], NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException("A brand with this name already exists.");
      }
      data.slug = slug;
      nameChanged = true;
    }

    const updated = await this.prisma.brand.update({ where: { id }, data });

    if (nameChanged) {
      await this.productHelper.syncProductsByBrand(id);
    }

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const brand = await this.findOne(id);

    const productCount = await this.prisma.product.count({
      where: { brandId: id },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete brand — it has ${productCount} linked product(s). Remove or reassign them first.`,
      );
    }

    if (brand.logoUrl) {
      await this.storageService.delete(brand.logoUrl).catch(() => {});
    }

    await this.prisma.brand.delete({ where: { id } });
    return { message: "Brand deleted successfully." };
  }
}
