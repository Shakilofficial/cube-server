import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  Version,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MIME_TYPES, multerConfig } from '@cube/storage';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  UserRole,
  ResponseMessage,
} from '@cube/common';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

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

  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category updated successfully')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
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

  @Post(':id/icon')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Icon uploaded successfully')
  @UseInterceptors(
    FileInterceptor(
      'icon',
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: 'image',
      }),
    ),
  )
  uploadIcon(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.categoryService.uploadIcon(id, file);
  }
}
