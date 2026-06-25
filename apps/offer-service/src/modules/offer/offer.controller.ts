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
} from "@nestjs/common";
import {
  JwtAuthGuard,
  ResponseMessage,
  Roles,
  RolesGuard,
  UserRole,
} from "@cube/common";
import { OfferService } from "./offer.service";
import { OfferCalculatorService } from "./offer-calculator.service";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { UpdateOfferDto } from "./dto/update-offer.dto";
import { QueryOfferDto } from "./dto/query-offer.dto";
import { CalculateOfferDto } from "./dto/calculate-offer.dto";
import { FlashSaleActionDto } from "./dto/flash-sale-action.dto";

@Controller("offers")
export class OfferController {
  constructor(
    private readonly offerService: OfferService,
    private readonly offerCalculatorService: OfferCalculatorService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get()
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Offers retrieved successfully")
  findAll(@Query() query: QueryOfferDto) {
    return this.offerService.findAll(query);
  }

  @Get(":id")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Offer retrieved successfully")
  findOne(@Param("id") id: string) {
    return this.offerService.findOne(id);
  }

  // ─── Protected — Admin/Manager ────────────────────────────────────────────

  @Post()
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Offer created successfully")
  create(@Body() dto: CreateOfferDto) {
    return this.offerService.create(dto);
  }

  @Patch(":id")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Offer updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateOfferDto) {
    return this.offerService.update(id, dto);
  }

  @Delete(":id")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Offer disabled successfully")
  remove(@Param("id") id: string) {
    return this.offerService.remove(id);
  }

  // ─── Flash Sale Stock Management ─────────────────────────────────────────

  @Post(":id/flash-sale/reserve")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Flash sale stock reserved successfully")
  reserveFlashSale(@Param("id") id: string, @Body() dto: FlashSaleActionDto) {
    return this.offerService.reserveFlashSaleStock(id, dto.quantity);
  }

  @Post(":id/flash-sale/confirm")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Flash sale stock confirmed successfully")
  confirmFlashSale(@Param("id") id: string, @Body() dto: FlashSaleActionDto) {
    return this.offerService.confirmFlashSaleStock(id, dto.quantity);
  }

  @Post(":id/flash-sale/release")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Flash sale stock released successfully")
  releaseFlashSale(@Param("id") id: string, @Body() dto: FlashSaleActionDto) {
    return this.offerService.releaseFlashSaleStock(id, dto.quantity);
  }

  // ─── Internal — Cart Service ──────────────────────────────────────────────
  // Note: Protected by JwtAuthGuard to prevent public DoS on this DB-heavy endpoint.

  @Post("calculate")
  @Version("1")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Best offer calculated successfully")
  calculate(@Body() dto: CalculateOfferDto) {
    return this.offerCalculatorService.calculateBestOffer(
      dto.items,
      dto.subtotal,
    );
  }
}
