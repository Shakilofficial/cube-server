import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MIME_TYPES, StorageService, multerConfig } from '@cube/storage';
import {
  JwtAuthGuard,
  ResponseMessage,
  Roles,
  RolesGuard,
  UserRole,
} from '@cube/common';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';

@Controller('brands')
export class BrandController {
  constructor(
    private readonly brandService: BrandService,
    private readonly storageService: StorageService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Brands retrieved successfully')
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.brandService.findAll({ page, limit, search });
  }

  @Get(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Brand retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.brandService.findOne(id);
  }

  // ─── Protected ───────────────────────────────────────────────────────────

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Brand created successfully')
  create(@Body() dto: CreateBrandDto) {
    return this.brandService.create(dto);
  }

  /**
   * PATCH /v1/brands/:id
   *
   * Accepts multipart/form-data with the following optional fields:
   * - name        (string)
   * - description (string)
   * - website     (string)
   * - seoTitle    (string)
   * - seoDesc     (string)
   * - logo        (file — JPEG, PNG, WebP, etc.)
   *
   * When a logo file is uploaded:
   *   1. The file is processed and compressed by Sharp → WebP.
   *   2. The result is uploaded to S3 under brands/<id>/
   *   3. The old logo (if any) is deleted from S3.
   *   4. The brand is updated with the new logoUrl.
   *
   * Text-only updates work exactly as before with a JSON body.
   */
  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Brand updated successfully')
  @UseInterceptors(
    FileInterceptor(
      'logo',
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: 'image',
      }),
    ),
  )
  async update(
    @Param('id') id: string,
    @UploadedFile() logoFile?: Express.Multer.File,
    @Body('name') name?: string,
    @Body('description') description?: string,
    @Body('website') website?: string,
    @Body('seoTitle') seoTitle?: string,
    @Body('seoDesc') seoDesc?: string,
  ) {
    let logoUrl: string | undefined;

    if (logoFile) {
      // Fetch existing brand to get current logoUrl for deletion
      const existing = await this.brandService.findOne(id);

      // Upload new logo (compressed to WebP by StorageService)
      const uploaded = await this.storageService.upload(logoFile.buffer, {
        folder: `brands/${id}`,
        originalName: logoFile.originalname,
        mimeType: logoFile.mimetype,
        imagePreset: 'image',
        metadata: { brandId: id },
      });

      logoUrl = uploaded.url;

      // Delete the previous logo from S3 if it exists
      if (existing?.logoUrl) {
        await this.storageService.delete(existing.logoUrl).catch(() => {});
      }
    }

    // Validate that at least one field is being updated
    if (!name && !description && !website && !seoTitle && !seoDesc && !logoFile) {
      throw new BadRequestException(
        'At least one field (name, description, website, seoTitle, seoDesc, or logo) must be provided.',
      );
    }

    const dto: {
      name?: string;
      description?: string;
      website?: string;
      seoTitle?: string;
      seoDesc?: string;
      logoUrl?: string;
    } = {};
    if (name) dto.name = name.trim();
    if (description) dto.description = description.trim();
    if (website) dto.website = website.trim();
    if (seoTitle) dto.seoTitle = seoTitle.trim();
    if (seoDesc) dto.seoDesc = seoDesc.trim();
    if (logoUrl) dto.logoUrl = logoUrl;

    return this.brandService.update(id, dto);
  }

  @Delete(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Brand deleted successfully')
  remove(@Param('id') id: string) {
    return this.brandService.remove(id);
  }
}
