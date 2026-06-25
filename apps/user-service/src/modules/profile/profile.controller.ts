import { JwtAuthGuard, JwtUser, ResponseMessage } from "@cube/common";
import { IMAGE_MIME_TYPES, StorageService, multerConfig } from "@cube/storage";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ProfileService } from "./profile.service";

/**
 * ProfileController handles profile-owner routes.
 * All routes are scoped to the authenticated user's own data.
 * Admin-facing routes (list, create, reindex) live in UsersController.
 */
@Controller("users")
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly storageService: StorageService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Own Profile
  // ─────────────────────────────────────────────────────────────────────────

  @Get("profile")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("User profile retrieved successfully")
  getProfile(
    @CurrentUser() user: JwtUser,
    @Headers("authorization") authHeader: string,
  ) {
    return this.profileService.getProfile(user.sub, user.email, authHeader);
  }

  /**
   * PATCH /v1/users/profile
   *
   * Accepts multipart/form-data with the following optional fields:
   * - name        (string)
   * - phone       (string)
   * - avatar      (file — JPEG, PNG, WebP, etc.)
   *
   * When an avatar file is uploaded:
   *   1. The file is processed and compressed by Sharp → WebP.
   *   2. The result is uploaded to S3 under avatars/<userId>/
   *   3. The old avatar (if any) is deleted from S3.
   *   4. The profile is updated with the new avatarUrl.
   *
   * Text-only updates (name / phone) work exactly as before with JSON body.
   */
  @Patch("profile")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("User profile updated successfully")
  @UseInterceptors(
    FileInterceptor(
      "avatar",
      multerConfig({
        allowedMimeTypes: IMAGE_MIME_TYPES as unknown as any[],
        sizeCategory: "avatar",
      }),
    ),
  )
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Headers("authorization") authHeader: string,
    @UploadedFile() avatarFile?: Express.Multer.File,
    @Body("name") name?: string,
    @Body("phone") phone?: string,
  ) {
    let avatarUrl: string | undefined;

    if (avatarFile) {
      // Fetch existing profile to get current avatarUrl for deletion
      const existing = await this.profileService.getProfile(
        user.sub,
        user.email,
        authHeader,
      );

      // Upload new avatar (compressed to WebP by FileProcessorService)
      const uploaded = await this.storageService.upload(avatarFile.buffer, {
        folder: `avatars/${user.sub}`,
        originalName: avatarFile.originalname,
        mimeType: avatarFile.mimetype,
        imagePreset: "avatar",
        metadata: { userId: user.sub },
      });

      avatarUrl = uploaded.url;

      // Delete the previous avatar from S3 if it exists
      if (existing?.avatarUrl) {
        await this.storageService.delete(existing.avatarUrl);
      }
    }

    // Validate that at least one field is being updated
    if (!name && !phone && !avatarFile) {
      throw new BadRequestException(
        "At least one field (name, phone, or avatar) must be provided.",
      );
    }

    const dto: { name?: string; phone?: string; avatarUrl?: string } = {};
    if (name) dto.name = name.trim();
    if (phone) dto.phone = phone.trim();
    if (avatarUrl) dto.avatarUrl = avatarUrl;

    return this.profileService.updateProfile(user.sub, dto, authHeader);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Profile Sync (called by oauth-service / other microservices)
  // ─────────────────────────────────────────────────────────────────────────

  @Post("sync")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("User profile synchronized successfully")
  async syncProfile(
    @Body()
    dto: { id: string; email: string; name: string; avatarUrl?: string },
    @Headers("authorization") authHeader: string,
  ) {
    if (!dto.id || !dto.email || !dto.name) {
      throw new BadRequestException(
        "Missing required fields for profile synchronization.",
      );
    }
    return this.profileService.upsertProfile(
      dto.id,
      dto.email,
      { name: dto.name, avatarUrl: dto.avatarUrl },
      authHeader,
    );
  }
}
