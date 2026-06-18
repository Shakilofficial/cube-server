import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { paginationHelper } from '@cube/common';
import { generateSlug } from '../../common/helpers';
import { StorageService } from '@cube/storage';


@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateBrandDto) {
    const slug = generateSlug(dto.name);

    const existing = await this.prisma.brand.findFirst({
      where: { OR: [{ name: dto.name }, { slug }] },
    });
    if (existing) {
      throw new ConflictException('A brand with this name already exists.');
    }

    return this.prisma.brand.create({
      data: {
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
            { name: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, data] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
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
    await this.findOne(id);

    const data: any = { ...dto };

    if (dto.name) {
      const slug = generateSlug(dto.name);
      const conflict = await this.prisma.brand.findFirst({
        where: { OR: [{ name: dto.name }, { slug }], NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException('A brand with this name already exists.');
      }
      data.slug = slug;
    }

    return this.prisma.brand.update({ where: { id }, data });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const brand = await this.findOne(id);

    const productCount = await this.prisma.product.count({ where: { brandId: id } });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete brand — it has ${productCount} linked product(s). Remove or reassign them first.`,
      );
    }

    if (brand.logoUrl) {
      await this.storageService.delete(brand.logoUrl).catch(() => {});
    }

    await this.prisma.brand.delete({ where: { id } });
    return { message: 'Brand deleted successfully.' };
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    const brand = await this.findOne(id);

    const uploadResult = await this.storageService.upload(file.buffer, {
      folder: `brands/${id}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      imagePreset: 'image',
    });

    if (brand.logoUrl) {
      await this.storageService.delete(brand.logoUrl).catch(() => {});
    }

    return this.prisma.brand.update({
      where: { id },
      data: { logoUrl: uploadResult.url },
    });
  }
}
