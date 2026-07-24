
import {
  Inject,
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Readable } from "stream";
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
} from "cloudinary";
import { v4 as uuidv4 } from "uuid";
import { FileProcessorService, ImagePreset } from "./file-processor.service";

export interface UploadOptions {
  /** Folder prefix in Cloudinary, e.g. "avatars" or "documents" */
  folder: string;
  /** Original file name (used to determine extension for non-image files) */
  originalName: string;
  /** MIME type reported by the client */
  mimeType: string;
  /** Image processing preset — only relevant for image files */
  imagePreset?: ImagePreset;
  /** Optional custom metadata to attach to the Cloudinary asset context */
  metadata?: Record<string, string>;
}

export interface UploadResult {
  /** Full public Cloudinary delivery URL */
  url: string;
  /** Cloudinary public ID (used for deletion) */
  key: string;
  /** Final MIME type after processing */
  mimeType: string;
  /** File size after compression (bytes) */
  size: number;
  /** Compression ratio string, e.g. "3.24x" */
  compressionRatio: string;
}

type CloudinaryResourceType = "image" | "video" | "raw";

interface CloudinaryAssetIdentifier {
  publicId: string;
  resourceType: CloudinaryResourceType;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cloudName: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(FileProcessorService)
    private readonly fileProcessor: FileProcessorService,
  ) {
    this.cloudName = this.config.getOrThrow<string>("CLOUDINARY_CLOUD_NAME");

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.config.getOrThrow<string>("CLOUDINARY_API_KEY"),
      api_secret: this.config.getOrThrow<string>("CLOUDINARY_API_SECRET"),
      secure: true,
    });

    this.logger.log(
      `StorageService initialized — Cloudinary cloud: ${this.cloudName}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upload
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process (compress/resize) and upload a file to Cloudinary.
   * Returns the public URL and public ID for later deletion.
   */
  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const {
      folder,
      originalName,
      mimeType,
      imagePreset = "image",
      metadata = {},
    } = options;

    // 1. Process / compress the file
    const processed = await this.fileProcessor.process(
      buffer,
      mimeType,
      originalName,
      imagePreset,
    );

    // 2. Build a unique public ID with a timestamp prefix for cache-busting
    const timestamp = Date.now();
    const uniqueId = uuidv4().replace(/-/g, "").slice(0, 12);
    const resourceType = this.resourceTypeFor(processed.mimeType);
    // Cloudinary auto-appends the detected format for image/video assets, but
    // "raw" assets are delivered byte-for-byte under the public ID as given —
    // so the extension must be baked in for raw uploads to keep a usable name.
    const publicId =
      resourceType === "raw"
        ? `${folder}/${timestamp}-${uniqueId}.${processed.extension}`
        : `${folder}/${timestamp}-${uniqueId}`;

    // 3. Upload to Cloudinary
    let result: UploadApiResponse;
    try {
      result = await this.uploadBuffer(processed.buffer, {
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
        context: {
          original_filename: originalName,
          original_mime_type: mimeType,
          compression_ratio: processed.compressionRatio,
          ...metadata,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Cloudinary upload failed for public ID "${publicId}": ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        "File upload failed. Please try again.",
      );
    }

    this.logger.log(
      `Uploaded: ${result.public_id} | ${processed.originalSize} → ${processed.processedSize} bytes (${processed.compressionRatio})`,
    );

    return {
      url: result.secure_url,
      key: result.public_id,
      mimeType: processed.mimeType,
      size: processed.processedSize,
      compressionRatio: processed.compressionRatio,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Delete an asset from Cloudinary by its full delivery URL or public ID.
   * Silently succeeds if the asset does not exist.
   */
  async delete(urlOrKey: string): Promise<void> {
    const identifier = this.resolveIdentifier(urlOrKey);
    if (!identifier) {
      this.logger.warn(
        `delete() called with an unresolvable URL/key: "${urlOrKey}"`,
      );
      return;
    }

    try {
      await cloudinary.uploader.destroy(identifier.publicId, {
        resource_type: identifier.resourceType,
        invalidate: true,
      });
      this.logger.log(`Deleted Cloudinary asset: ${identifier.publicId}`);
    } catch (err: any) {
      // Log but do not throw — deletion failures are non-fatal
      this.logger.error(
        `Failed to delete Cloudinary asset "${identifier.publicId}": ${err.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Presigned URL (download)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a signed, time-limited download URL for a Cloudinary asset.
   * Note: unlike S3, this only truly expires for assets whose Cloudinary
   * delivery type is "authenticated" — for standard "upload" type assets
   * (what `upload()` produces) the link is signed but publicly reachable
   * at the same URL regardless of `expiresInSeconds`.
   */
  async getPresignedDownloadUrl(
    urlOrKey: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const identifier = this.resolveIdentifier(urlOrKey);
    if (!identifier) {
      throw new NotFoundException(`Object not found: ${urlOrKey}`);
    }

    try {
      return cloudinary.utils.private_download_url(
        identifier.publicId,
        "",
        {
          resource_type: identifier.resourceType,
          type: "upload",
          expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to presign URL for "${identifier.publicId}": ${err.message}`,
      );
      throw new InternalServerErrorException(
        "Could not generate download URL.",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exists check
  // ─────────────────────────────────────────────────────────────────────────

  async exists(urlOrKey: string): Promise<boolean> {
    const identifier = this.resolveIdentifier(urlOrKey);
    if (!identifier) return false;
    try {
      await cloudinary.api.resource(identifier.publicId, {
        resource_type: identifier.resourceType,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  private uploadBuffer(
    buffer: Buffer,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new Error("Empty Cloudinary response"));
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  private resourceTypeFor(mimeType: string): CloudinaryResourceType {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
      return "video";
    return "raw";
  }

  /**
   * Resolve a stored URL or bare public ID into a public ID + resource type
   * pair. Cloudinary delivery URLs encode the resource type as the path
   * segment right before "/upload/" (e.g. ".../image/upload/v169.../key.webp"),
   * which is the only place that information is recoverable from a URL alone.
   */
  private resolveIdentifier(
    urlOrKey: string,
  ): CloudinaryAssetIdentifier | null {
    if (!urlOrKey) return null;

    if (!urlOrKey.startsWith("http")) {
      return { publicId: urlOrKey, resourceType: "image" };
    }

    try {
      const url = new URL(urlOrKey);
      const parts = url.pathname.split("/").filter(Boolean);
      const uploadIdx = parts.indexOf("upload");
      if (uploadIdx < 1) return null;

      const resourceType = parts[uploadIdx - 1] as CloudinaryResourceType;
      if (!["image", "video", "raw"].includes(resourceType)) return null;

      let rest = parts.slice(uploadIdx + 1);
      if (rest[0] && /^v\d+$/.test(rest[0])) {
        rest = rest.slice(1);
      }
      const joined = rest.join("/");
      const publicId =
        resourceType === "raw" ? joined : joined.replace(/\.[^./]+$/, "");

      if (!publicId) return null;
      return { publicId, resourceType };
    } catch {
      return null;
    }
  }
}
