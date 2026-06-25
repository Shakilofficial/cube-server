import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Query,
  Param,
  Version,
  BadRequestException,
  UseGuards,
} from "@nestjs/common";
import { RegistrationService } from "./registration.service";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  UserRole,
  ResponseMessage,
} from "@cube/common";

@Controller("auth")
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post("register")
  @Version("1")
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("User registered successfully")
  register(@Body() dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException("Either email or phone must be provided.");
    }
    return this.registrationService.register(dto);
  }

  @Post("users")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("User created successfully")
  createUser(@Body() dto: CreateUserDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException("Either email or phone must be provided.");
    }
    return this.registrationService.createUser(dto);
  }

  @Get("users")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Users retrieved successfully")
  getAllUsers(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("ids") ids?: string,
  ) {
    return this.registrationService.getAllUsers({
      page,
      limit,
      sortBy,
      sortOrder,
      role,
      status,
      search,
      ids,
    });
  }

  @Get("users/:id")
  @Version("1")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("User retrieved successfully")
  getUserById(@Param("id") id: string) {
    return this.registrationService.getUserById(id);
  }
}
