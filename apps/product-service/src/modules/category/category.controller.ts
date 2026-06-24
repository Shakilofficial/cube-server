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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly storageService: StorageService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Categories retrieved successfully')
  findAll() {
    return this.categoryService.findAll();
  }

  @Get(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  // ─── Protected ───────────────────────────────────────────────────────────

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Category created successfully')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  /**
   * PATCH /v1/categories/:id
   *
   * Accepts multipart/form-data with the following optional fields:
   * - name      (string)
   * - parentId  (string)
   * - icon      (file — JPEG, PNG, WebP, etc.)
   *
   * When an icon file is uploaded:
   *   1. The file is processed and compressed by Sharp → WebP.
   *   2. The result is uploaded to S3 under categories/<id>/
   *   3. The old icon (if any) is deleted from S3.
   *   4. The category is updated with the new iconUrl.
   *
   * Text-only updates work exactly as before with a JSON body.
   */
  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category updated successfully')
  @UseInterceptors(
    FileInterceptor(
      'icon',
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: 'image',
      }),
    ),
  )
  async update(
    @Param('id') id: string,
    @UploadedFile() iconFile?: Express.Multer.File,
    @Body('name') name?: string,
    @Body('parentId') parentId?: string,
  ) {
    let iconUrl: string | undefined;

    if (iconFile) {
      // Fetch existing category to get current iconUrl for deletion
      const existing = await this.categoryService.findOne(id);

      // Upload new icon (compressed to WebP by StorageService)
      const uploaded = await this.storageService.upload(iconFile.buffer, {
        folder: `categories/${id}`,
        originalName: iconFile.originalname,
        mimeType: iconFile.mimetype,
        imagePreset: 'image',
        metadata: { categoryId: id },
      });

      iconUrl = uploaded.url;

      // Delete the previous icon from S3 if it exists
      if (existing?.iconUrl) {
        await this.storageService.delete(existing.iconUrl).catch(() => {});
      }
    }

    // Validate that at least one field is being updated
    if (!name && !parentId && !iconFile) {
      throw new BadRequestException(
        'At least one field (name, parentId, or icon) must be provided.',
      );
    }

    const dto: { name?: string; parentId?: string | null; iconUrl?: string } = {};
    if (name) dto.name = name.trim();
    if (parentId !== undefined) dto.parentId = parentId || null;
    if (iconUrl) dto.iconUrl = iconUrl;

    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category deleted successfully')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }
}

