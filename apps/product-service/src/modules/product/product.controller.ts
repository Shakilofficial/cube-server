import {
  JwtAuthGuard,
  JwtUser,
  ResponseMessage,
  Roles,
  RolesGuard,
  UserRole,
} from "@cube/common";
import { IMAGE_MIME_TYPES, multerConfig } from "@cube/storage";
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
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CreateBulkProductsDto } from "./dto/create-bulk.dto";
import { CreateProductColorDto } from "./dto/create-color.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { QueryProductDto } from "./dto/query-product.dto";
import { UpdateProductColorDto } from "./dto/update-color.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { ProductService } from "./product.service";

@Controller("products")
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ─── Public / Optional Auth ──────────────────────────────────────────────

  @Get()
  @Version("1")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Products retrieved successfully")
  findAll(@Query() query: QueryProductDto, @CurrentUser() user?: JwtUser) {
    return this.productService.findAll(query, user);
  }

  @Get("internal/search")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  internalSearch(
    @Query("search") search?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.productService.internalSearch({ search, page, limit });
  }

  @Get("brand/:slug")
  @Version("1")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Brand products retrieved successfully")
  findAllByBrand(
    @Param("slug") slug: string,
    @Query() query: QueryProductDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.productService.findAllByBrandSlug(slug, query, user);
  }

  @Get("category/:slug")
  @Version("1")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Category products retrieved successfully")
  findAllByCategory(
    @Param("slug") slug: string,
    @Query() query: QueryProductDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.productService.findAllByCategorySlug(slug, query, user);
  }

  @Get(":slug/related")
  @Version("1")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Related products retrieved successfully")
  findRelated(@Param("slug") slug: string, @CurrentUser() user?: JwtUser) {
    return this.productService.findRelatedProducts(slug, user);
  }

  @Get(":slug")
  @Version("1")
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Product retrieved successfully")
  findOne(@Param("slug") slug: string, @CurrentUser() user?: JwtUser) {
    return this.productService.findOneBySlug(slug, user);
  }

  // ─── Protected — Write ───────────────────────────────────────────────────

  @Post()
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Product created successfully")
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Post("bulk")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Bulk products created successfully")
  createBulk(@Body() dto: CreateBulkProductsDto) {
    return this.productService.createBulk(dto);
  }

  @Patch(":id")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Product updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Patch(":id/status")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Product status updated successfully")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateStatusDto) {
    return this.productService.updateStatus(id, dto.status);
  }

  @Delete(":id")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Product deleted successfully")
  remove(@Param("id") id: string) {
    return this.productService.remove(id);
  }

  // ─── Color Management ─────────────────────────────────────────────────────

  @Post(":id/colors")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Color created successfully")
  createColor(@Param("id") id: string, @Body() dto: CreateProductColorDto) {
    return this.productService.createColor(id, dto);
  }

  @Patch(":id/colors/:colorId")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Color updated successfully")
  updateColor(
    @Param("id") id: string,
    @Param("colorId") colorId: string,
    @Body() dto: UpdateProductColorDto,
  ) {
    return this.productService.updateColor(id, colorId, dto);
  }

  @Delete(":id/colors/:colorId")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Color deleted successfully")
  removeColor(@Param("id") id: string, @Param("colorId") colorId: string) {
    return this.productService.removeColor(id, colorId);
  }

  // ─── Image Management ─────────────────────────────────────────────────────

  @Post(":id/images")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Images uploaded successfully")
  @UseInterceptors(
    FilesInterceptor(
      "images",
      10,
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: "image",
      }),
    ),
  )
  uploadImages(
    @Param("id") id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("colorId") colorId?: string,
  ) {
    return this.productService.uploadImages(id, files, colorId);
  }

  @Delete(":id/images/:imageId")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Image deleted successfully")
  deleteImage(@Param("id") id: string, @Param("imageId") imageId: string) {
    return this.productService.deleteImage(id, imageId);
  }

  @Patch(":id/images/:imageId/primary")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Primary image updated successfully")
  setPrimaryImage(@Param("id") id: string, @Param("imageId") imageId: string) {
    return this.productService.setPrimaryImage(id, imageId);
  }
}
