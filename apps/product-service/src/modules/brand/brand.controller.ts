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
  UseGuards,
  Version,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MIME_TYPES, multerConfig } from '@cube/storage';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  UserRole,
  ResponseMessage,
} from '@cube/common';

@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

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

  @Patch(':id')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Brand updated successfully')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
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

  @Post(':id/logo')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logo uploaded successfully')
  @UseInterceptors(
    FileInterceptor(
      'logo',
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: 'image',
      }),
    ),
  )
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brandService.uploadLogo(id, file);
  }
}
