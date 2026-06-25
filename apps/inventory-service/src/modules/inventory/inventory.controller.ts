import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { InventoryService } from "./inventory.service";
import { ReserveService } from "./reserve.service";
import { ReserveInventoryDto } from "./dto/reserve-inventory.dto";
import { ConfirmReleaseDto } from "./dto/confirm-release.dto";
import { RestockDto } from "./dto/restock.dto";
import { BulkUpdateDto } from "./dto/bulk-update.dto";

@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reserveService: ReserveService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get(":productId")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Inventory retrieved successfully")
  getStock(@Param("productId") productId: string) {
    return this.inventoryService.getStock(productId);
  }

  // ─── Service-to-Service Operations ───────────────────────────────────────

  @Post("reserve")
  @Version("1")
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("Inventory reserved successfully")
  reserve(@Body() dto: ReserveInventoryDto) {
    return this.reserveService.reserve(dto);
  }

  @Post("confirm")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Reservation confirmed successfully")
  confirm(@Body() dto: ConfirmReleaseDto) {
    return this.inventoryService.confirm(dto);
  }

  @Post("release")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Reservation released successfully")
  release(@Body() dto: ConfirmReleaseDto) {
    return this.inventoryService.release(dto);
  }

  // ─── Protected — Admin/Manager ────────────────────────────────────────────

  @Post("restock")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Stock restocked successfully")
  restock(@Body() dto: RestockDto) {
    return this.inventoryService.restock(dto);
  }

  @Post("bulk-update")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Bulk stock update successful")
  bulkUpdate(@Body() dto: BulkUpdateDto) {
    return this.inventoryService.bulkUpdate(dto.items);
  }
}
