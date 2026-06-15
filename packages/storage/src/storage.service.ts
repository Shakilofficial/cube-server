import {
  Inject,
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { FileProcessorService, ImagePreset } from './file-processor.service';

export interface UploadOptions {
  /** Folder prefix in S3, e.g. "avatars" or "documents" */
  folder: string;
  /** Original file name (used to determine extension for non-image files) */
  originalName: string;
  /** MIME type reported by the client */
  mimeType: string;
  /** Image processing preset — only relevant for image files */
  imagePreset?: ImagePreset;
  /** Optional custom metadata to attach to the S3 object */
  metadata?: Record<string, string>;
}

export interface UploadResult {
  /** Full public CDN / S3 URL */
  url: string;
  /** S3 object key (used for deletion) */
  key: string;
  /** Final MIME type after processing */
  mimeType: string;
  /** File size after compression (bytes) */
  size: number;
  /** Compression ratio string, e.g. "3.24x" */
  compressionRatio: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(FileProcessorService) private readonly fileProcessor: FileProcessorService,
  ) {
    this.region = this.config.getOrThrow<string>('AWS_REGION');
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET_NAME');

    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.logger.log(
      `StorageService initialized — bucket: ${this.bucket}, region: ${this.region}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upload
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process (compress/resize) and upload a file to S3.
   * Returns the public URL and S3 key for later deletion.
   */
  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const { folder, originalName, mimeType, imagePreset = 'image', metadata = {} } = options;

    // 1. Process / compress the file
    const processed = await this.fileProcessor.process(
      buffer,
      mimeType,
      originalName,
      imagePreset,
    );

    // 2. Build a unique S3 key with a timestamp prefix for cache-busting
    const timestamp = Date.now();
    const uniqueId = uuidv4().replace(/-/g, '').slice(0, 12);
    const key = `${folder}/${timestamp}-${uniqueId}.${processed.extension}`;

    // 3. Upload to S3
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: processed.buffer,
          ContentType: processed.mimeType,
          CacheControl: 'max-age=31536000, immutable',
          Metadata: {
            originalName,
            originalMimeType: mimeType,
            compressionRatio: processed.compressionRatio,
            ...metadata,
          },
        }),
      );
    } catch (err: any) {
      this.logger.error(`S3 upload failed for key "${key}": ${err.message}`, err.stack);
      throw new InternalServerErrorException('File upload failed. Please try again.');
    }

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    this.logger.log(
      `Uploaded: ${key} | ${processed.originalSize} → ${processed.processedSize} bytes (${processed.compressionRatio})`,
    );

    return {
      url,
      key,
      mimeType: processed.mimeType,
      size: processed.processedSize,
      compressionRatio: processed.compressionRatio,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Delete an object from S3 by its full URL or key.
   * Silently succeeds if the object does not exist.
   */
  async delete(urlOrKey: string): Promise<void> {
    const key = this.extractKeyFromUrl(urlOrKey);
    if (!key) {
      this.logger.warn(`delete() called with an unresolvable URL/key: "${urlOrKey}"`);
      return;
    }

    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.log(`Deleted S3 object: ${key}`);
    } catch (err: any) {
      // Log but do not throw — deletion failures are non-fatal
      this.logger.error(`Failed to delete S3 object "${key}": ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Presigned URL (download)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a short-lived presigned download URL for a private S3 object.
   * Useful for documents and other private files.
   */
  async getPresignedDownloadUrl(
    urlOrKey: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const key = this.extractKeyFromUrl(urlOrKey);
    if (!key) {
      throw new NotFoundException(`Object not found: ${urlOrKey}`);
    }

    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
    } catch (err: any) {
      this.logger.error(`Failed to presign URL for "${key}": ${err.message}`);
      throw new InternalServerErrorException('Could not generate download URL.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exists check
  // ─────────────────────────────────────────────────────────────────────────

  async exists(urlOrKey: string): Promise<boolean> {
    const key = this.extractKeyFromUrl(urlOrKey);
    if (!key) return false;
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract the S3 key from a full S3 URL or return the input as-is if it
   * already looks like a key (no leading "https://").
   */
  private extractKeyFromUrl(urlOrKey: string): string | null {
    if (!urlOrKey) return null;

    // Already a key (no protocol)
    if (!urlOrKey.startsWith('http')) return urlOrKey;

    try {
      const url = new URL(urlOrKey);
      // pathname starts with "/", strip the leading slash
      return url.pathname.slice(1);
    } catch {
      return null;
    }
  }
}
