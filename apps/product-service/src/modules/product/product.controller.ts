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
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CreateBulkProductsDto } from './dto/create-bulk.dto';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  UserRole,
  ResponseMessage,
} from '@cube/common';
import { IMAGE_MIME_TYPES, multerConfig } from '@cube/storage';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Products retrieved successfully')
  findAll(@Query() query: QueryProductDto) {
    return this.productService.findAll(query);
  }

  @Get('internal/search')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  internalSearch(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productService.internalSearch({ search, page, limit });
  }

  @Get(':id')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product retrieved successfully')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  // ─── Protected — Write ───────────────────────────────────────────────────

  @Post()
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Product created successfully')
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Post('bulk')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Bulk products created successfully')
  createBulk(@Body() dto: CreateBulkProductsDto) {
    return this.productService.createBulk(dto);
  }

  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product updated successfully')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Patch(':id/status')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product status updated successfully')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.productService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Product deleted successfully')
  remove(@Param('id') id: string) {
    return this.productService.remove(id);
  }

  // ─── Image Management ─────────────────────────────────────────────────────

  @Post(':id/images')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Images uploaded successfully')
  @UseInterceptors(
    FilesInterceptor(
      'images',
      10,
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: 'image',
      }),
    ),
  )
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.productService.uploadImages(id, files);
  }

  @Delete(':id/images/:imageId')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Image deleted successfully')
  deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productService.deleteImage(id, imageId);
  }

  @Patch(':id/images/:imageId/primary')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Primary image updated successfully')
  setPrimaryImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productService.setPrimaryImage(id, imageId);
  }
}
