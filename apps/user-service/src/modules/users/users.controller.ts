import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Param,
  Query,
  UseGuards,
  Version,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ProfileService } from "../profile/profile.service";
import { SearchService } from "../../core/search/search.service";
import { CreateUserDto } from "../profile/dto/create-user.dto";
import { UserAuthHelper } from "../profile/helpers/user-auth.helper";
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  UserRole,
  ResponseMessage,
} from "@cube/common";

/**
 * UsersController handles all admin-facing user management routes.
 * - List / search users  (Elasticsearch-powered)
 * - Get single user      (merged auth + profile data)
 * - Create user          (admin provision)
 * - Reindex Elasticsearch
 *
 * All routes require authentication. Role restrictions are enforced per-route.
 */
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly searchService: SearchService,
    private readonly config: ConfigService,
    private readonly userAuthHelper: UserAuthHelper,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // List & Search
  // ─────────────────────────────────────────────────────────────────────────

  @Get()
  @Version("1")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Users retrieved successfully")
  async getAllUsers(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.searchService.searchUsers({
      search,
      role,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sortBy: sortBy || "createdAt",
      sortOrder: sortOrder || "desc",
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Single User Detail
  // ─────────────────────────────────────────────────────────────────────────

  @Get(":id")
  @Version("1")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("User retrieved successfully")
  async getUserById(
    @Param("id") id: string,
    @Headers("authorization") authHeader: string,
  ) {
    const account = await this.userAuthHelper.getUser(id, authHeader);

    if (!account) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    const profile = await this.profileService.getProfile(
      id,
      undefined,
      authHeader,
    );

    return {
      id: account.id,
      email: account.email,
      phone: account.phone,
      role: account.role,
      status: account.status,
      name:
        profile?.name || (account.email ? account.email.split("@")[0] : "User"),
      avatarUrl: profile?.avatarUrl || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin: Create User
  // ─────────────────────────────────────────────────────────────────────────

  @Post()
  @Version("1")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage("User created successfully")
  async createUser(
    @Body() dto: CreateUserDto,
    @Headers("authorization") authHeader: string,
  ) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException("Either email or phone must be provided.");
    }
    if (dto.role !== UserRole.MANAGER && dto.role !== UserRole.SUPPORT) {
      throw new BadRequestException(
        "Admin can only create MANAGER or SUPPORT role users.",
      );
    }

    try {
      const actualAuthUser = await this.userAuthHelper.createUser(
        {
          email: dto.email,
          phone: dto.phone,
          password: dto.password,
          role: dto.role,
          name: dto.name,
        },
        authHeader,
      );

      const emailPlaceholder =
        dto.email || `${actualAuthUser.id}@placeholder.com`;
      const profile = await this.profileService.createUserProfile(
        actualAuthUser.id,
        emailPlaceholder,
        dto.name,
        dto.phone,
        authHeader,
      );

      await this.profileService.syncUserToElastic(
        actualAuthUser.id,
        actualAuthUser,
        authHeader,
      );

      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        role: actualAuthUser.role,
        status: "ACTIVE",
        createdAt: profile.createdAt,
      };
    } catch (err: any) {
      if (
        err instanceof ConflictException ||
        err instanceof BadRequestException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }
      throw new InternalServerErrorException(
        err.message || "An error occurred during user provisioning.",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin: Reindex Elasticsearch
  // ─────────────────────────────────────────────────────────────────────────

  @Post("reindex")
  @Version("1")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Elasticsearch indexing completed successfully")
  async reindexAll(@Headers("authorization") authHeader: string) {
    const result = await this.profileService.syncAllToElasticSearch(authHeader);
    return {
      message: "Elasticsearch user indexing completed successfully.",
      ...result,
    };
  }
}
